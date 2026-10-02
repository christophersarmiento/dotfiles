# Conventional Commits

Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/#specification).

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

- Prefix every commit with a noun type, an optional scope, an optional `!`, and a required colon and space.
- Use `feat` for new features and `fix` for bug fixes. Other types (such as `docs`, `build`, `chore`, `ci`, `style`, `refactor`, `perf`, and `test`) are allowed.
- If provided, the scope must be a noun describing a section of the codebase, enclosed in parentheses, e.g., `fix(parser):`.
- Immediately follow the colon and space with a short description of the changes.
- An optional, free-form body must begin one blank line after the description and may contain multiple paragraphs.
- Optional footers must be separated from the body by one blank line. Each footer consists of a word token, either `: ` or ` #` as its separator, and a string value, e.g., `Reviewed-by: Z` or `Refs #123`.
- Footer tokens must use hyphens instead of whitespace, except for the token `BREAKING CHANGE`. Footer values may contain spaces and newlines; a value ends when the next valid footer token/separator pair begins.
- Indicate every breaking change with `!` immediately before the prefix's colon, a `BREAKING CHANGE: <description>` footer, or both. Breaking changes may occur with any type.
- When using `!`, the description must describe the breaking change, and the breaking-change footer may be omitted.
- A breaking-change footer must use uppercase `BREAKING CHANGE`, followed by a colon, a space, and a description. `BREAKING-CHANGE` is synonymous with `BREAKING CHANGE` as a footer token.
- Conventional Commits elements are case-insensitive, except that breaking-change footer tokens must be uppercase.
- SemVer mapping: `fix` corresponds to PATCH, `feat` to MINOR, and any breaking change to MAJOR. Other types have no implicit SemVer effect unless they include a breaking change.

## Additional commit rules

- Use imperative mood.
- Always split changes into logical commits.
