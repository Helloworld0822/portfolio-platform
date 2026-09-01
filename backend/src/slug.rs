use rand::Rng;

use crate::db::PgPool;

pub fn slugify(title: &str) -> String {
    // If title is entirely non-ASCII, use random suffix
    if !title.chars().any(|c| c.is_ascii()) {
        format!("post-{}", random_suffix())
    } else {
        let base = slug::slugify(title);
        if base.is_empty() {
            format!("post-{}", random_suffix())
        } else {
            base
        }
    }
}

fn random_suffix() -> String {
    let choices = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    (0..6)
        .map(|_| choices[rng.gen_range(0..choices.len())] as char)
        .collect()
}

pub async fn unique_slug(pool: &PgPool, title: &str) -> Result<String, anyhow::Error> {
    let conn = pool.get().await?;
    let base = slugify(title);

    let base_taken: bool = conn
        .query_one(
            "SELECT EXISTS(SELECT 1 FROM posts WHERE slug = $1)",
            &[&base],
        )
        .await?
        .get(0);

    if !base_taken {
        return Ok(base);
    }

    loop {
        let candidate = format!("{}-{}", base, random_suffix());
        let taken: bool = conn
            .query_one(
                "SELECT EXISTS(SELECT 1 FROM posts WHERE slug = $1)",
                &[&candidate],
            )
            .await?
            .get(0);
        if !taken {
            return Ok(candidate);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::slugify;

    #[test]
    fn slugifies_ascii_title() {
        assert_eq!(slugify("Hello World"), "hello-world");
    }

    #[test]
    fn falls_back_to_random_slug_for_non_ascii_title() {
        let result = slugify("안녕하세요");
        assert!(result.starts_with("post-"));
        assert_eq!(result.len(), "post-".len() + 6);
    }
}
