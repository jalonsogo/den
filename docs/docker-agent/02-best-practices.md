# Best Practices

Source: https://docs.docker.com/ai/docker-agent/best-practices/

## 1. Handling Large Command Outputs

**Problem:** Shell commands generating extensive output can overwhelm the agent's context window.

**Solution:** Redirect output to a file, then read it. The Read tool automatically truncates large files to 2,000 lines.

**Anti-pattern:**

```yaml
reviewer:
  instruction: |
    Run validation: `docker buildx bake validate`
    Check the output for errors.
  toolsets:
    - type: shell
```

**Recommended approach:**

```yaml
reviewer:
  instruction: |
    Run validation and save output:
    `docker buildx bake validate > validation.log 2>&1`

    Read validation.log to check for errors.
    The file can be large - read the first 2000 lines.
    Errors usually appear at the beginning.
  toolsets:
    - type: filesystem
    - type: shell
```

---

## 2. Structuring Agent Teams

**Principle:** Specialized agents with focused responsibilities produce better results than monolithic agents.

**Pattern:** Coordinator model — a root agent delegates to specialists.

**Example — Documentation team:**

```yaml
agents:
  root:
    description: Technical writing coordinator
    instruction: |
      Coordinate documentation work:
      1. Delegate to writer for content creation
      2. Delegate to editor for formatting polish
      3. Delegate to reviewer for validation
      4. Loop back through editor if reviewer finds issues
    sub_agents: [writer, editor, reviewer]
    toolsets: [filesystem, todo]

  writer:
    description: Creates and edits documentation content
    instruction: |
      Write clear, practical documentation.
      Focus on content quality - the editor handles formatting.
    toolsets: [filesystem, think]

  editor:
    description: Polishes formatting and style
    instruction: |
      Fix formatting issues, wrap lines, run prettier.
      Remove AI-isms and polish style.
      Don't change meaning or add content.
    toolsets: [filesystem, shell]

  reviewer:
    description: Runs validation tools
    instruction: |
      Run validation suite, report failures.
    toolsets: [filesystem, shell]
```

**When to use teams:**
- Multiple distinct workflow steps
- Different skills required per phase
- Later feedback may necessitate retrying earlier steps

**When to use a single agent:**
- Simple, focused tasks
- Single-step work
- Coordination overhead adds minimal value

---

## 3. Optimizing RAG Performance

RAG indexing can be slow on large codebases.

**Strategy 1 — Narrow the scope:**

```yaml
# Inefficient
rag:
  codebase:
    docs: [./]

# Optimized
rag:
  codebase:
    docs: [./src/api, ./docs, ./examples]
```

**Strategy 2 — Increase batching and concurrency:**

```yaml
strategies:
  - type: chunked-embeddings
    embedding_model: openai/text-embedding-3-small
    batch_size: 50
    max_embedding_concurrency: 10
    chunking:
      size: 2000
      overlap: 150
```

**Strategy 3 — Use BM25 for local keyword search:**

BM25 is fast and runs locally without API calls — ideal for exact term matching (function names, error messages).

```yaml
strategies:
  - type: bm25
    database: ./bm25.db
    chunking:
      size: 1500
```

---

## 4. Preserving Document Scope

**Problem:** Agents tend to expand minimal guides into comprehensive tutorials, changing their character.

**Solution:** Explicit scope instructions:

```yaml
writer:
  instruction: |
    When updating documentation:

    1. Understand the current document's scope and length
    2. Match that character - don't transform minimal guides into tutorials
    3. Add only what's genuinely missing
    4. Value brevity - not every topic needs comprehensive coverage

    Good additions fill gaps. Bad additions change the document's character.
    When in doubt, add less rather than more.
```

**Key principle:** Without explicit guidance, agents default to being comprehensive. Tell them explicitly to preserve the existing document's scope.

---

## 5. Model Selection

Match model capability to task complexity and role.

**Use larger models** (Sonnet, GPT-5) for:
- Complex reasoning and planning
- Writing and editing content
- Coordinating multiple agents
- Tasks requiring judgment and creativity

**Use smaller models** (Haiku, GPT-5 Mini) for:
- Running validation tools
- Simple structured tasks
- Reading logs and reporting errors
- High-volume, low-complexity work

**Example configuration:**

```yaml
agents:
  root:
    model: anthropic/claude-sonnet-4-5
  writer:
    model: anthropic/claude-sonnet-4-5
  editor:
    model: anthropic/claude-sonnet-4-5
  reviewer:
    model: anthropic/claude-haiku-4-5
```

The reviewer uses Haiku because it just runs commands and checks for errors — no complex reasoning needed. Haiku is faster and cheaper for this role.
