# Argument Mapping Specification v1.0

## Overview
This document defines the standardized format for representing arguments as structured JSON data. This specification enables clear visualization and analysis of logical argument structures.

---

## Core Concepts

### Node Types

**1. Claim (Conclusion)**
- The main assertion or position being argued
- What the arguer wants you to believe or accept
- Can be supported or opposed by other nodes

**2. Premise (Reason)**
- Supporting evidence or reasoning for a claim
- Provides justification or grounds for accepting a claim
- Can be factual statements, principles, or sub-arguments

**3. Objection (Counter-argument)**
- Challenges or disputes a claim
- Presents reasons why a claim might be false or weak
- Can target the claim itself or its supporting premises

**4. Rebuttal**
- Responses to objections
- Defends a claim against challenges
- May concede points while maintaining the overall claim

**5. Evidence**
- Factual data, statistics, examples, or citations
- Provides concrete support for premises or claims
- Should include source information when possible

**6. Clarification**
- Defines terms or explains concepts
- Provides necessary context
- Helps prevent misunderstanding

---

## Relationship Types

### Support Relationships

**supports**
- Indicates that one node strengthens or provides reason to believe another
- Direction: from premise/evidence → to claim
- Can have varying strength levels

**strongly_supports**
- Indicates very strong evidential or logical support
- Used when the supporting node provides compelling justification

### Opposition Relationships

**opposes**
- Indicates that one node weakens or challenges another
- Direction: from objection → to claim/premise
- Represents counterarguments or contradictory evidence

**refutes**
- Indicates strong opposition that potentially invalidates a claim
- Stronger than general opposition

### Other Relationships

**clarifies**
- Provides definition or explanation
- Direction: from clarification node → to any node needing context

**rebuts**
- Responds to and counters an objection
- Direction: from rebuttal → to objection

---

## JSON Schema

### Complete Argument Structure

```json
{
  "argument_map": {
    "title": "Brief title of the overall argument",
    "description": "Optional overview of what's being argued",
    "nodes": [
      {
        "id": "unique_node_identifier",
        "type": "claim|premise|objection|rebuttal|evidence|clarification",
        "content": "The actual text of this node",
        "metadata": {
          "confidence": "high|medium|low",
          "source": "Citation or source (if applicable)",
          "tags": ["optional", "categorization", "tags"]
        }
      }
    ],
    "edges": [
      {
        "id": "unique_edge_identifier",
        "from": "source_node_id",
        "to": "target_node_id",
        "relationship": "supports|strongly_supports|opposes|refutes|clarifies|rebuts",
        "strength": "strong|moderate|weak (optional)"
      }
    ]
  }
}
```

### Field Definitions

#### Node Fields

- **id** (string, required): Unique identifier, use format "node_1", "node_2", etc.
- **type** (string, required): One of the defined node types
- **content** (string, required): The actual argument text (1-3 sentences typically)
- **metadata** (object, optional):
  - **confidence** (string): How certain we are about this node's validity
  - **source** (string): Where this information came from
  - **tags** (array): Keywords for categorization

#### Edge Fields

- **id** (string, required): Unique identifier, use format "edge_1", "edge_2", etc.
- **from** (string, required): ID of the source node
- **to** (string, required): ID of the target node
- **relationship** (string, required): Type of relationship between nodes
- **strength** (string, optional): How strong the relationship is

---

## Design Principles

### 1. Atomic Nodes
Each node should contain ONE discrete idea or piece of evidence. Don't combine multiple claims or premises into a single node.

**Good**: 
- Node 1: "Exercise improves cardiovascular health"
- Node 2: "Exercise reduces stress levels"

**Bad**:
- Node 1: "Exercise improves cardiovascular health and reduces stress levels"

### 2. Clear Direction
Edges should flow in the direction of logical support. Generally:
- Premises point TO claims (supports)
- Objections point TO what they challenge (opposes)
- Rebuttals point TO objections (rebuts)

### 3. Appropriate Granularity
Break down complex arguments into manageable components, but don't over-decompose simple statements.

### 4. Explicit Relationships
Make the relationship type clear and specific. Use "strongly_supports" vs "supports" when the distinction matters.

---

## Metadata Usage Guidelines

### Confidence Levels

- **high**: Well-established facts, strong logical connections, expert consensus
- **medium**: Reasonable but debatable claims, partial evidence
- **low**: Speculative claims, weak evidence, controversial positions

### Source Attribution

Include sources for:
- Statistical claims
- Expert opinions
- Scientific findings
- Historical facts
- Quoted material

Format: "Author Name, Publication/Source, Year" or URL for online sources

### Tags

Use tags to categorize arguments by:
- Domain (science, ethics, politics, etc.)
- Type (empirical, logical, moral, etc.)
- Topic keywords

---

## Validation Rules

A valid argument map must:

1. Have at least one claim node
2. Have no orphaned nodes (except the root claim)
3. Have valid edge references (from/to must reference existing node IDs)
4. Use only defined node types and relationship types
5. Have unique IDs for all nodes and edges
6. Have non-empty content for all nodes

---

## Common Patterns

### Simple Linear Argument
```
[Evidence] --supports--> [Premise] --supports--> [Claim]
```

### Argument with Opposition
```
[Premise 1] --supports--> [Claim] <--opposes-- [Objection]
                           ↑
                           |
                      supports
                           |
                      [Premise 2]
```

### Argument with Rebuttal
```
[Premise] --supports--> [Claim] <--opposes-- [Objection]
                                                 ↑
                                                 |
                                              rebuts
                                                 |
                                            [Rebuttal]
```

### Complex Multi-layered Argument
```
[Evidence 1] --supports--> [Premise 1] --supports--> [Claim]
[Evidence 2] --supports--> [Premise 2] --supports--> ↑
                                                      |
                           [Objection 1] --opposes----+
                                 ↑
                                 |
                              rebuts
                                 |
                           [Rebuttal 1]
```

---

## Version History

- **v1.0** (2026-02-16): Initial specification
