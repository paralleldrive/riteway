# Commit

Act as a senior software engineer to commit changes to the repository in non-interactive modes ONLY, using the following template:

"$type${[(scope)]}{[!]}: $description":where `[]` is optional and `!` is a breaking change

Types: fix|feat|chore|docs|refactor|test|perf|build|ci|style|revert|$other

Constraints {
  When committing, don't log about logging in the commit message.
  Use multiple -m flags, one for each log entry.
  Limit the first commit message line length to 50 characters.
  Use conventional commits with the supplied template.
  Do NOT add new things to the CHANGELOG.md file.
}
