#include "forge_web.h"
#include "forge/string.h"
#include <errno.h>
#include <inttypes.h>
#include <stdio.h>
#include <limits.h>
#include <pthread.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
static int64_t active_pool;
int64_t portfolio_pool(void) { return active_pool; }
int64_t portfolio_pool_set(int64_t pool) { active_pool=pool; return 1; }

enum { PORTFOLIO_HEALTH_BATCH_SIZE = 64 };
typedef struct PortfolioHealthWaiter {
    struct PortfolioHealthWaiter *next;
    const char *ip;
    struct timespec deadline;
    int pending;
    int done;
    int status;
} PortfolioHealthWaiter;
static pthread_mutex_t portfolio_health_mutex = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t portfolio_health_changed = PTHREAD_COND_INITIALIZER;
static PortfolioHealthWaiter *portfolio_health_head;
static PortfolioHealthWaiter *portfolio_health_tail;
static int portfolio_health_busy;

static int portfolio_health_expired(const PortfolioHealthWaiter *waiter,
                                    const struct timespec *now) {
    return now->tv_sec > waiter->deadline.tv_sec ||
        (now->tv_sec == waiter->deadline.tv_sec &&
         now->tv_nsec >= waiter->deadline.tv_nsec);
}

static void portfolio_health_unlink(PortfolioHealthWaiter *waiter) {
    PortfolioHealthWaiter *previous = NULL;
    PortfolioHealthWaiter *current = portfolio_health_head;
    while (current && current != waiter) {
        previous = current;
        current = current->next;
    }
    if (!current) return;
    if (previous) previous->next = current->next;
    else portfolio_health_head = current->next;
    if (portfolio_health_tail == current) portfolio_health_tail = previous;
    current->next = NULL;
    current->pending = 0;
    current->status = 503;
    current->done = 1;
    pthread_cond_broadcast(&portfolio_health_changed);
}

static void portfolio_health_query(PortfolioHealthWaiter **batch, int count,
                                   int *statuses) {
    if (count < 1 || count > PORTFOLIO_HEALTH_BATCH_SIZE) return;
    static const char singleton_sql[] =
        "SELECT EXISTS(SELECT 1 FROM banned_ips WHERE ip=$1 AND "
        "(expires_at IS NULL OR expires_at>now()))";
    static const char batch_sql[] =
        "SELECT ordinality, EXISTS(SELECT 1 FROM banned_ips WHERE "
        "ip=items.ip AND (expires_at IS NULL OR expires_at>now())) "
        "FROM jsonb_array_elements_text($1::jsonb) WITH ORDINALITY "
        "AS items(ip,ordinality)";
    for (int i = 0; i < count; i++) statuses[i] = 500;
    for (int i = 0; i < count; i++) if (!batch[i]->ip) return;
    int64_t conn = fpg_acquire(active_pool);
    if (!conn) {
        for (int i = 0; i < count; i++) statuses[i] = 503;
        return;
    }
    int64_t params = fpg_params();
    int64_t result = 0;
    if (!params) goto cleanup;
    const char *value = batch[0]->ip;
    if (count > 1) {
        int64_t ips = fw_array();
        if (!ips) goto cleanup;
        for (int i = 0; i < count; i++) {
            int64_t ip = fw_string(batch[i]->ip);
            if (!ip || !fw_push(ips, ip)) goto cleanup;
        }
        value = fw_dump(ips);
    }
    if (!value || !fpg_push(params, value)) goto cleanup;
    result = fpg_query_prepared(conn, count == 1 ? singleton_sql : batch_sql,
                                params);
    if (!fpg_ok(result) || fpg_rows(result) != count) goto cleanup;
    unsigned char seen[PORTFOLIO_HEALTH_BATCH_SIZE] = {0};
    int resolved[PORTFOLIO_HEALTH_BATCH_SIZE];
    for (int row = 0; row < count; row++) {
        int index = 0;
        if (count > 1) {
            const char *ordinal = fpg_value(result, row, 0);
            char *end;
            if (!ordinal || ordinal[0] < '1' || ordinal[0] > '9') goto cleanup;
            errno = 0;
            long parsed = strtol(ordinal, &end, 10);
            if (errno || *end || parsed < 1 || parsed > count) goto cleanup;
            index = (int)parsed - 1;
        }
        if (seen[index]) goto cleanup;
        seen[index] = 1;
        const char *banned = fpg_value(result, row, count == 1 ? 0 : 1);
        if (!banned) goto cleanup;
        if (!strcmp(banned, "t")) resolved[index] = 403;
        else if (!strcmp(banned, "f")) resolved[index] = 200;
        else goto cleanup;
    }
    for (int i = 0; i < count; i++) if (!seen[i]) goto cleanup;
    for (int i = 0; i < count; i++) statuses[i] = resolved[i];
cleanup:
    fpg_clear(result);
    fpg_params_close(params);
    fpg_release(active_pool, conn);
}

int64_t portfolio_health(int64_t request) {
    PortfolioHealthWaiter waiter = {
        .ip = fw_ip(request), .pending = 1, .status = 500
    };
    if (clock_gettime(CLOCK_REALTIME, &waiter.deadline) != 0)
        return fw_respond(request, 503, "{\"error\":\"unavailable\"}");
    waiter.deadline.tv_sec += 10;
    pthread_mutex_lock(&portfolio_health_mutex);
    if (portfolio_health_tail) portfolio_health_tail->next = &waiter;
    else portfolio_health_head = &waiter;
    portfolio_health_tail = &waiter;
    while (!waiter.done) {
        struct timespec now;
        int clock_failed = clock_gettime(CLOCK_REALTIME, &now) != 0;
        if (waiter.pending &&
            (clock_failed || portfolio_health_expired(&waiter, &now))) {
            portfolio_health_unlink(&waiter);
            continue;
        }
        if (portfolio_health_busy) {
            /* Only queued nodes may time out: selected nodes lend their stack
             * and IP to the leader until SQL and connection cleanup finish. */
            if (waiter.pending) {
                int waiting = pthread_cond_timedwait(&portfolio_health_changed,
                    &portfolio_health_mutex, &waiter.deadline);
                if (waiting == ETIMEDOUT && waiter.pending && !waiter.done)
                    portfolio_health_unlink(&waiter);
            } else {
                pthread_cond_wait(&portfolio_health_changed,
                                  &portfolio_health_mutex);
            }
            continue;
        }
        PortfolioHealthWaiter *batch[PORTFOLIO_HEALTH_BATCH_SIZE] = {0};
        int statuses[PORTFOLIO_HEALTH_BATCH_SIZE] = {0};
        int count = 0;
        while (portfolio_health_head && count < PORTFOLIO_HEALTH_BATCH_SIZE) {
            PortfolioHealthWaiter *current = portfolio_health_head;
            portfolio_health_head = current->next;
            current->next = NULL;
            current->pending = 0;
            if (clock_failed || portfolio_health_expired(current, &now)) {
                current->status = 503;
                current->done = 1;
                pthread_cond_broadcast(&portfolio_health_changed);
            } else {
                batch[count++] = current;
            }
        }
        if (!portfolio_health_head) portfolio_health_tail = NULL;
        if (!count) continue;
        portfolio_health_busy = 1;
        pthread_mutex_unlock(&portfolio_health_mutex);
        portfolio_health_query(batch, count, statuses);
        pthread_mutex_lock(&portfolio_health_mutex);
        /* Borrowed IPs and stack waiters stay alive until all query work and
         * lease cleanup finish; only then may callbacks wake and return. */
        for (int i = 0; i < count; i++) {
            batch[i]->status = statuses[i];
            batch[i]->done = 1;
        }
        int failure = statuses[0];
        if (failure == 500 || failure == 503) {
            for (int i = 1; i < count; i++)
                if (statuses[i] != failure) failure = 0;
            if (failure) {
                /* One failed live check rejects the current pending burst;
                 * fresh requests still perform a new authoritative query. */
                while (portfolio_health_head) {
                    PortfolioHealthWaiter *current = portfolio_health_head;
                    portfolio_health_head = current->next;
                    current->next = NULL;
                    current->pending = 0;
                    current->status = failure;
                    current->done = 1;
                }
                portfolio_health_tail = NULL;
            }
        }
        portfolio_health_busy = 0;
        pthread_cond_broadcast(&portfolio_health_changed);
    }
    pthread_mutex_unlock(&portfolio_health_mutex);
    const char *body = "{\"error\":\"internal\"}";
    if (waiter.status == 200) body = "{\"status\":\"ok\"}";
    else if (waiter.status == 403) body = "{\"error\":\"forbidden\"}";
    else if (waiter.status == 503) body = "{\"error\":\"unavailable\"}";
    return fw_respond(request, waiter.status, body);
}

static int64_t dispatch_request(int64_t request) {
    int64_t result=frmod_routes_dispatch(request);
    fr_str_arena_reset();
    return result;
}
int64_t portfolio_run(const char *host,int64_t port,int64_t workers) {
    return fw_run(host,port,workers,dispatch_request);
}

typedef struct {
    char *data;
    size_t used;
    size_t capacity;
} PortfolioPostsBuffer;

static int portfolio_posts_reserve(PortfolioPostsBuffer *buffer, size_t needed) {
    size_t capacity = buffer->capacity ? buffer->capacity : 4096;
    while (capacity < needed) {
        if (capacity > SIZE_MAX / 2) { capacity = needed; break; }
        capacity *= 2;
    }
    char *data = realloc(buffer->data, capacity);
    if (!data) return 0;
    buffer->data = data;
    buffer->capacity = capacity;
    return 1;
}

static inline int portfolio_posts_append(PortfolioPostsBuffer *buffer,
                                         const char *text, size_t length) {
    if (length > SIZE_MAX - buffer->used - 1) return 0;
    size_t needed = buffer->used + length + 1;
    if (needed > buffer->capacity && !portfolio_posts_reserve(buffer, needed))
        return 0;
    memcpy(buffer->data + buffer->used, text, length);
    buffer->used += length;
    buffer->data[buffer->used] = 0;
    return 1;
}

static int portfolio_posts_string(PortfolioPostsBuffer *buffer,
                                  const char *text) {
    static const char hex[] = "0123456789abcdef";
    if (!text || !portfolio_posts_append(buffer, "\"", 1)) return 0;
    const char *start = text;
    const char *p = text;
    for (; *p; p++) {
        unsigned char byte = (unsigned char)*p;
        if (byte != '"' && byte != '\\' && byte >= 0x20) continue;
        if (!portfolio_posts_append(buffer, start, (size_t)(p - start))) return 0;
        if (byte == '"' || byte == '\\') {
            char escaped[2] = {'\\', (char)byte};
            if (!portfolio_posts_append(buffer, escaped, sizeof escaped)) return 0;
        } else {
            char escaped[6] = {'\\', 'u', '0', '0', hex[byte >> 4], hex[byte & 15]};
            if (!portfolio_posts_append(buffer, escaped, sizeof escaped)) return 0;
        }
        start = p + 1;
    }
    return portfolio_posts_append(buffer, start, (size_t)(p - start)) &&
           portfolio_posts_append(buffer, "\"", 1);
}

static int portfolio_posts_number(PortfolioPostsBuffer *buffer,
                                  const char *text, int nonnegative) {
    if (!text || !*text) return 0;
    int negative = *text == '-';
    const char *digit = text + negative;
    if (!*digit) return 0;
    uint64_t limit = negative ? UINT64_C(9223372036854775808) : INT64_MAX;
    uint64_t number = 0;
    for (const char *p = digit; *p; p++) {
        if (*p < '0' || *p > '9') return 0;
        unsigned value = (unsigned)(*p - '0');
        if (number > limit / 10 ||
            (number == limit / 10 && value > limit % 10)) return 0;
        number = number * 10 + value;
    }
    if (nonnegative && negative && number) return 0;
    char canonical[32];
    char *end = canonical + sizeof canonical;
    char *start = end;
    uint64_t remaining = number;
    do {
        *--start = (char)('0' + remaining % 10);
        remaining /= 10;
    } while (remaining);
    if (negative && number) *--start = '-';
    return portfolio_posts_append(buffer, start, (size_t)(end - start));
}

static int portfolio_posts_timestamp(PortfolioPostsBuffer *buffer,
                                     const char *encoded) {
    if (!encoded || *encoded != '"') return 0;
    size_t length = strlen(encoded);
    if (length < 2 || encoded[length - 1] != '"') return 0;
    /* PostgreSQL to_json(timestamptz) produces an ASCII JSON string, including
     * infinity and BC dates. Reject escapes and interior quotes before reuse. */
    for (size_t index = 1; index + 1 < length; index++) {
        unsigned char byte = (unsigned char)encoded[index];
        if (byte < 0x20 || byte >= 0x7f || byte == '"' || byte == '\\') return 0;
    }
    return portfolio_posts_append(buffer, encoded, length);
}

int64_t portfolio_post_summaries(int64_t request, int64_t result,
                                 int64_t guarded) {
    PortfolioPostsBuffer buffer = {0};
    int64_t response = 0;
    int emitted = 0;
    if ((guarded != 0 && guarded != 1) || !fpg_ok(result)) goto cleanup;
    int64_t count = fpg_rows(result);
    if (guarded && count < 1) goto cleanup;
    if (count < 0 || (uint64_t)count > (SIZE_MAX - 2) / 128) goto cleanup;
    if (!portfolio_posts_reserve(&buffer, (size_t)count * 128 + 2)) goto cleanup;
    if (!portfolio_posts_append(&buffer, "[", 1)) goto cleanup;
    for (int64_t index = 0; index < count; index++) {
        if (guarded && (fpg_is_null(result, index, 0) ||
                       strcmp(fpg_value(result, index, 0), "f") != 0))
            goto cleanup;
        if (fpg_is_null(result, index, guarded)) {
            if (!guarded || count != 1) goto cleanup;
            continue;
        }
        for (int64_t column = 0; column < 5; column++) {
            if (fpg_is_null(result, index, guarded + column)) goto cleanup;
        }
        if (emitted && !portfolio_posts_append(&buffer, ",", 1)) goto cleanup;
        if (!portfolio_posts_append(&buffer, "{\"id\":", sizeof "{\"id\":" - 1) ||
            !portfolio_posts_number(&buffer, fpg_value(result, index, guarded), 0) ||
            !portfolio_posts_append(&buffer, ",\"title\":", sizeof ",\"title\":" - 1) ||
            !portfolio_posts_string(&buffer, fpg_value(result, index, guarded + 1)) ||
            !portfolio_posts_append(&buffer, ",\"excerpt\":", sizeof ",\"excerpt\":" - 1) ||
            !portfolio_posts_string(&buffer, fpg_value(result, index, guarded + 2)) ||
            !portfolio_posts_append(&buffer, ",\"created_at\":", sizeof ",\"created_at\":" - 1) ||
            !portfolio_posts_timestamp(&buffer, fpg_value(result, index, guarded + 3)) ||
            !portfolio_posts_append(&buffer, ",\"comment_count\":", sizeof ",\"comment_count\":" - 1) ||
            !portfolio_posts_number(&buffer, fpg_value(result, index, guarded + 4), 1) ||
            !portfolio_posts_append(&buffer, "}", 1))
            goto cleanup;
        emitted = 1;
    }
    if (!portfolio_posts_append(&buffer, "]", 1)) goto cleanup;
    /* fw_respond copies the body before the request buffer is freed. */
    response = fw_respond(request, 200, buffer.data);
cleanup:
    free(buffer.data);
    if (!response)
        response = fw_respond(request, 500, "{\"error\":\"internal\"}");
    return response;
}
