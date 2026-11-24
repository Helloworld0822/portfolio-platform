import json
import os
import sys

service, bucket, identity, api, nginx, fixture, schema = sys.argv[1:]
if schema not in {"fresh", "upgraded"}:
    raise SystemExit("unknown staging schema")
db_url = "postgres://forge:" + os.environ["STAGE_DB_PASSWORD"] + "@127.0.0.1/forge_stage"
jwt = os.environ["STAGE_JWT"]
mock_url = "http://127.0.0.1:19090"


def container(name, image, memory, port, env=None):
    return {
        "name": name, "image": image,
        "resources": {"limits": {"cpu": "1", "memory": memory}},
        "env": [{"name": k, "value": v} for k, v in (env or {}).items()],
        "startupProbe": {"tcpSocket": {"port": port}, "periodSeconds": 3, "failureThreshold": 70},
    }


db = container("db", fixture, "512Mi", 5432, {
    "POSTGRES_USER": "forge", "POSTGRES_DB": "forge_stage",
    "POSTGRES_PASSWORD": os.environ["STAGE_DB_PASSWORD"], "PGDATA": "/tmp/pgdata",
    "STAGE_SCHEMA": schema,
})
forge = container("api", api, "512Mi", 8081, {
    "DATABASE_URL": db_url, "DATABASE_POOL_SIZE": "1", "JWT_SECRET": jwt,
    "HOST": "0.0.0.0", "PORT": "8081", "FORGE_TRUSTED_PROXIES": "127.0.0.1/32",
    "ADMIN_GITHUB_USERNAME": "Helloworld0822", "GITHUB_CLIENT_ID": "test-client",
    "GITHUB_CLIENT_SECRET": "test-client-secret", "FRONTEND_URL": "http://frontend.test",
    "BACKEND_BASE_URL": "http://127.0.0.1:8081", "CORS_ALLOWED_ORIGINS": "http://frontend.test",
    "GITHUB_OAUTH_BASE_URL": mock_url, "GITHUB_API_BASE_URL": mock_url,
    "SOLVED_PROFILE_URL": mock_url + "/solved",
})
forge["volumeMounts"] = [{"name": "uploads", "mountPath": "/app/uploads"}]
check = container("verify", fixture, "512Mi", 19091, {
    "TEST_DATABASE_URL": db_url, "TEST_JWT_SECRET": jwt, "STAGE_SCHEMA": schema,
    "API_BASE": "http://127.0.0.1:8081",
})
check["command"] = ["sh", "/stage/verify.sh"]
web = container("nginx", nginx, "256Mi", 8080)
web["ports"] = [{"containerPort": 8080}]
print(json.dumps({
    "apiVersion": "serving.knative.dev/v1", "kind": "Service",
    "metadata": {"name": service, "annotations": {
        "run.googleapis.com/invoker-iam-disabled": "false",
        "run.googleapis.com/custom-audiences": json.dumps(["urn:portfolio:forge-staging"]),
    }},
    "spec": {"template": {"metadata": {"annotations": {
        "run.googleapis.com/execution-environment": "gen2",
        "autoscaling.knative.dev/maxScale": "1",
        "run.googleapis.com/container-dependencies": json.dumps({"api": ["db"], "verify": ["api"], "nginx": ["verify"]}),
    }}, "spec": {"serviceAccountName": identity, "containers": [web, db, forge, check],
                 "volumes": [{"name": "uploads", "csi": {"driver": "gcsfuse.run.googleapis.com",
                                                          "volumeAttributes": {"bucketName": bucket}}}]}}},
}))
