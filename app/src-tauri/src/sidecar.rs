//! Managed `fixen --gui` child: CLI resolution and server-URL parsing.
//! Pure seams live here so they can be unit-tested without spawning anything.

use std::path::PathBuf;

/// A way to launch the fixen CLI: program + leading args.
#[derive(Debug, Clone, PartialEq)]
pub struct CliCandidate {
    pub program: String,
    pub args: Vec<String>,
}

/// Extract the dashboard URL from one line of `fixen --gui` stdout.
/// The line looks like: `gui   http://127.0.0.1:5177 (Ctrl+C to stop)`.
pub fn parse_gui_url(line: &str) -> Option<String> {
    let start = line.find("http://127.0.0.1:")?;
    let rest = &line[start..];
    let end = rest
        .find(|c: char| !(c.is_ascii_alphanumeric() || c == ':' || c == '/' || c == '.'))
        .unwrap_or(rest.len());
    let url = &rest[..end];
    // Require an actual port after the colon.
    let port = url.rsplit(':').next()?;
    if port.is_empty() || !port.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    Some(url.to_string())
}

/// Resolution order: FIXEN_APP_CLI (whitespace-split command) → `fixen` on
/// PATH → the dev checkout baked in at build time (run via `node`).
/// Later candidates are fallbacks when an earlier CLI is too old for --gui.
pub fn cli_candidates(
    env_override: Option<&str>,
    path_fixen: Option<PathBuf>,
    dev_cli: Option<&str>,
) -> Vec<CliCandidate> {
    let mut candidates = Vec::new();
    if let Some(command) = env_override {
        let mut parts = command.split_whitespace().map(str::to_string);
        if let Some(program) = parts.next() {
            candidates.push(CliCandidate {
                program,
                args: parts.collect(),
            });
        }
    }
    if let Some(path) = path_fixen {
        candidates.push(CliCandidate {
            program: path.display().to_string(),
            args: Vec::new(),
        });
    }
    if let Some(dev) = dev_cli {
        if !dev.trim().is_empty() {
            candidates.push(CliCandidate {
                program: "node".to_string(),
                args: vec![dev.to_string()],
            });
        }
    }
    candidates
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_gui_url_line() {
        assert_eq!(
            parse_gui_url("gui   http://127.0.0.1:5177 (Ctrl+C to stop)"),
            Some("http://127.0.0.1:5177".to_string())
        );
        assert_eq!(
            parse_gui_url("gui   http://127.0.0.1:60123"),
            Some("http://127.0.0.1:60123".to_string())
        );
        assert_eq!(parse_gui_url("something else"), None);
        assert_eq!(parse_gui_url(""), None);
    }

    #[test]
    fn candidate_order_is_env_then_path_then_dev() {
        let got = cli_candidates(
            Some("node /x/fixen.js"),
            Some(PathBuf::from("/usr/local/bin/fixen")),
            Some("/repo/bin/fixen.js"),
        );
        assert_eq!(got.len(), 3);
        assert_eq!(got[0].program, "node");
        assert_eq!(got[0].args, vec!["/x/fixen.js".to_string()]);
        assert_eq!(got[1].program, "/usr/local/bin/fixen");
        assert!(got[1].args.is_empty());
        assert_eq!(got[2].program, "node");
        assert_eq!(got[2].args, vec!["/repo/bin/fixen.js".to_string()]);
    }

    #[test]
    fn missing_sources_are_skipped() {
        let got = cli_candidates(None, None, Some("/repo/bin/fixen.js"));
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].program, "node");
        let none = cli_candidates(None, None, None);
        assert!(none.is_empty());
        // empty strings are not candidates
        let empty = cli_candidates(Some("  "), None, Some(""));
        assert!(empty.is_empty());
    }
}
