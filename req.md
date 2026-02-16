User: can you please clean up this doc

GitHub Copilot: Read [](file:///home/alex/apps/argument_mapper/req.md)

Your document contains a mix of requirements, instructions, and some informal notes. Here’s a cleaned-up, clear version, organized for readability and actionability:

---

# MVP Requirements for Argument Mapper

## Core Functionality
1. **Real-time Input**: Two users, each submitting one statement at a time via a single text input field.
2. **AI Integration**: Use an API (e.g., Claude Sonnet 4.5) to summarize each statement into a concise, hyperbole-free claim.
3. **Argument Map**: After each submission, generate and update a visual map (nodes and edges) in JSON format. Each node includes:
   - `id` (e.g., "A1")
   - `speaker` ("User A" or "User B")
   - `claim` (summarized statement)
   - `type` ("premise" or "conclusion")
   - `status` ("approved", etc.)
   - `flags` (e.g., "unresolved conflict", "hyperbole", "steelman")
4. **User Control**: Users can veto or edit any summary by referencing node IDs (e.g., “B3 is wrong”). The AI reprocesses and updates the map accordingly.
5. **Front-End Only**: No back-end or storage. All sessions are live and browser-based.
6. **UI/UX**:
   - Single text input box
   - Dynamic, color-coded graph (using D3.js or Cytoscape.js)
   - Minimal buttons (e.g., veto, simplify)
   - Blue/green nodes for users, red for bad faith, green for steelman

## Technical Constraints
- **Language/Framework**: JavaScript (React + D3.js or Cytoscape.js)
- **AI API**: Send raw text and current JSON map (summaries only, no raw history) to Claude.
- **JSON Map Example**:
  ```json
  {
    "nodes": [
      {
        "id": "A1",
        "speaker": "User A",
        "claim": "Policy lacks evidence",
        "type": "conclusion",
        "status": "approved",
        "flags": []
      }
    ],
    "edges": []
  }
  ```
- **AI Output**: Updated JSON with new node(s), edges, and flags. Limit output to 400 tokens.
- **Session Management**: Limit context to last 10 summaries if the map exceeds 15 nodes (to control token usage).
- **No Storage**: All data is session-only; nothing is persisted.
