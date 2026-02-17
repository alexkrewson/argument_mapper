# Argument Mapping Examples

This document provides diverse examples of argument maps in JSON format, demonstrating various argument structures and complexity levels.

---

## Example 1: Simple Linear Argument

**Text:**
"We should reduce sugar consumption because excessive sugar intake leads to obesity. Studies show that people who consume high amounts of sugar are 50% more likely to be obese."

**Argument Map:**

```json
{
  "argument_map": {
    "title": "Reducing Sugar Consumption",
    "description": "Argues for reduced sugar consumption based on obesity risks",
    "nodes": [
      {
        "id": "node_1",
        "type": "claim",
        "content": "We should reduce sugar consumption",
        "metadata": {
          "confidence": "medium",
          "tags": ["health", "policy", "normative"]
        }
      },
      {
        "id": "node_2",
        "type": "premise",
        "content": "Excessive sugar intake leads to obesity",
        "metadata": {
          "confidence": "high",
          "tags": ["health", "empirical"]
        }
      },
      {
        "id": "node_3",
        "type": "evidence",
        "content": "People who consume high amounts of sugar are 50% more likely to be obese",
        "metadata": {
          "confidence": "high",
          "tags": ["health", "statistics", "empirical"]
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "from": "node_2",
        "to": "node_1",
        "relationship": "supports"
      },
      {
        "id": "edge_2",
        "from": "node_3",
        "to": "node_2",
        "relationship": "strongly_supports"
      }
    ]
  }
}
```

---

## Example 2: Argument with Objection and Rebuttal

**Text:**
"Remote work should be the default for knowledge workers because it increases productivity and improves work-life balance. Critics argue that remote work reduces collaboration, but video conferencing tools have made virtual collaboration nearly as effective as in-person meetings."

**Argument Map:**

```json
{
  "argument_map": {
    "title": "Remote Work as Default Policy",
    "description": "Advocates for remote work with productivity and work-life balance benefits, addressing collaboration concerns",
    "nodes": [
      {
        "id": "node_1",
        "type": "claim",
        "content": "Remote work should be the default for knowledge workers",
        "metadata": {
          "confidence": "medium",
          "tags": ["workplace", "policy", "normative"]
        }
      },
      {
        "id": "node_2",
        "type": "premise",
        "content": "Remote work increases productivity",
        "metadata": {
          "confidence": "medium",
          "tags": ["productivity", "empirical"]
        }
      },
      {
        "id": "node_3",
        "type": "premise",
        "content": "Remote work improves work-life balance",
        "metadata": {
          "confidence": "high",
          "tags": ["well-being", "empirical"]
        }
      },
      {
        "id": "node_4",
        "type": "objection",
        "content": "Remote work reduces collaboration",
        "metadata": {
          "confidence": "medium",
          "tags": ["collaboration", "empirical"]
        }
      },
      {
        "id": "node_5",
        "type": "rebuttal",
        "content": "Video conferencing tools have made virtual collaboration nearly as effective as in-person meetings",
        "metadata": {
          "confidence": "medium",
          "tags": ["technology", "collaboration"]
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "from": "node_2",
        "to": "node_1",
        "relationship": "supports"
      },
      {
        "id": "edge_2",
        "from": "node_3",
        "to": "node_1",
        "relationship": "supports"
      },
      {
        "id": "edge_3",
        "from": "node_4",
        "to": "node_1",
        "relationship": "opposes"
      },
      {
        "id": "edge_4",
        "from": "node_5",
        "to": "node_4",
        "relationship": "rebuts"
      }
    ]
  }
}
```

---

## Example 3: Complex Multi-layered Argument

**Text:**
"Universal basic income (UBI) would benefit society by reducing poverty and stimulating economic growth. When people have guaranteed income, they spend more on local businesses, which creates jobs. A pilot program in Finland showed reduced stress and improved mental health among participants. However, critics worry about the cost, estimating it would require a 15% tax increase. Yet this overlooks the savings from reduced welfare administration and healthcare costs associated with poverty-related illnesses."

**Argument Map:**

```json
{
  "argument_map": {
    "title": "The Case for Universal Basic Income",
    "description": "Arguments for UBI based on poverty reduction and economic growth, addressing cost concerns",
    "nodes": [
      {
        "id": "node_1",
        "type": "claim",
        "content": "Universal basic income would benefit society",
        "metadata": {
          "confidence": "medium",
          "tags": ["economics", "policy", "normative"]
        }
      },
      {
        "id": "node_2",
        "type": "premise",
        "content": "UBI reduces poverty",
        "metadata": {
          "confidence": "high",
          "tags": ["poverty", "economics"]
        }
      },
      {
        "id": "node_3",
        "type": "premise",
        "content": "UBI stimulates economic growth",
        "metadata": {
          "confidence": "medium",
          "tags": ["economics", "growth"]
        }
      },
      {
        "id": "node_4",
        "type": "premise",
        "content": "People with guaranteed income spend more on local businesses, creating jobs",
        "metadata": {
          "confidence": "medium",
          "tags": ["economics", "employment"]
        }
      },
      {
        "id": "node_5",
        "type": "evidence",
        "content": "A pilot program in Finland showed reduced stress and improved mental health among participants",
        "metadata": {
          "confidence": "high",
          "source": "Finland UBI pilot program",
          "tags": ["empirical", "mental-health"]
        }
      },
      {
        "id": "node_6",
        "type": "objection",
        "content": "UBI would be too expensive, requiring a 15% tax increase",
        "metadata": {
          "confidence": "medium",
          "tags": ["cost", "taxation"]
        }
      },
      {
        "id": "node_7",
        "type": "rebuttal",
        "content": "Savings from reduced welfare administration would offset costs",
        "metadata": {
          "confidence": "medium",
          "tags": ["cost", "efficiency"]
        }
      },
      {
        "id": "node_8",
        "type": "rebuttal",
        "content": "Reduced healthcare costs from preventing poverty-related illnesses would offset costs",
        "metadata": {
          "confidence": "medium",
          "tags": ["healthcare", "cost"]
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "from": "node_2",
        "to": "node_1",
        "relationship": "supports"
      },
      {
        "id": "edge_2",
        "from": "node_3",
        "to": "node_1",
        "relationship": "supports"
      },
      {
        "id": "edge_3",
        "from": "node_4",
        "to": "node_3",
        "relationship": "supports"
      },
      {
        "id": "edge_4",
        "from": "node_5",
        "to": "node_2",
        "relationship": "strongly_supports"
      },
      {
        "id": "edge_5",
        "from": "node_6",
        "to": "node_1",
        "relationship": "opposes"
      },
      {
        "id": "edge_6",
        "from": "node_7",
        "to": "node_6",
        "relationship": "rebuts"
      },
      {
        "id": "edge_7",
        "from": "node_8",
        "to": "node_6",
        "relationship": "rebuts"
      }
    ]
  }
}
```

---

## Example 4: Scientific Argument with Multiple Evidence Types

**Text:**
"Vaccines are safe and effective. Clinical trials involving over 40,000 participants showed 95% efficacy. Post-market surveillance of millions of doses confirmed rare side effects occur in less than 0.001% of cases. The mechanism of action is well understood: vaccines train the immune system by introducing harmless viral components."

**Argument Map:**

```json
{
  "argument_map": {
    "title": "Vaccine Safety and Efficacy",
    "description": "Scientific argument establishing vaccine safety and effectiveness through multiple evidence types",
    "nodes": [
      {
        "id": "node_1",
        "type": "claim",
        "content": "Vaccines are safe and effective",
        "metadata": {
          "confidence": "high",
          "tags": ["medicine", "science", "empirical"]
        }
      },
      {
        "id": "node_2",
        "type": "premise",
        "content": "Vaccines have high efficacy rates",
        "metadata": {
          "confidence": "high",
          "tags": ["efficacy", "empirical"]
        }
      },
      {
        "id": "node_3",
        "type": "evidence",
        "content": "Clinical trials involving over 40,000 participants showed 95% efficacy",
        "metadata": {
          "confidence": "high",
          "tags": ["clinical-trial", "statistics"]
        }
      },
      {
        "id": "node_4",
        "type": "premise",
        "content": "Vaccines have minimal side effects",
        "metadata": {
          "confidence": "high",
          "tags": ["safety", "empirical"]
        }
      },
      {
        "id": "node_5",
        "type": "evidence",
        "content": "Post-market surveillance of millions of doses confirmed rare side effects occur in less than 0.001% of cases",
        "metadata": {
          "confidence": "high",
          "tags": ["safety", "statistics", "surveillance"]
        }
      },
      {
        "id": "node_6",
        "type": "clarification",
        "content": "Vaccines train the immune system by introducing harmless viral components",
        "metadata": {
          "confidence": "high",
          "tags": ["mechanism", "biology"]
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "from": "node_2",
        "to": "node_1",
        "relationship": "strongly_supports"
      },
      {
        "id": "edge_2",
        "from": "node_3",
        "to": "node_2",
        "relationship": "strongly_supports"
      },
      {
        "id": "edge_3",
        "from": "node_4",
        "to": "node_1",
        "relationship": "strongly_supports"
      },
      {
        "id": "edge_4",
        "from": "node_5",
        "to": "node_4",
        "relationship": "strongly_supports"
      },
      {
        "id": "edge_5",
        "from": "node_6",
        "to": "node_1",
        "relationship": "clarifies"
      }
    ]
  }
}
```

---

## Example 5: Ethical Argument

**Text:**
"Animal testing for cosmetics should be banned because it causes unnecessary suffering. Animals used in testing experience pain and distress. Since cosmetic products are not essential for human survival, this suffering cannot be morally justified. Some argue testing ensures product safety, but alternative methods like in-vitro testing and computer modeling can provide safety data without animal harm."

**Argument Map:**

```json
{
  "argument_map": {
    "title": "Banning Animal Testing for Cosmetics",
    "description": "Ethical argument against cosmetic animal testing based on unnecessary suffering",
    "nodes": [
      {
        "id": "node_1",
        "type": "claim",
        "content": "Animal testing for cosmetics should be banned",
        "metadata": {
          "confidence": "medium",
          "tags": ["ethics", "animal-rights", "normative"]
        }
      },
      {
        "id": "node_2",
        "type": "premise",
        "content": "Animal testing for cosmetics causes unnecessary suffering",
        "metadata": {
          "confidence": "high",
          "tags": ["ethics", "suffering"]
        }
      },
      {
        "id": "node_3",
        "type": "evidence",
        "content": "Animals used in testing experience pain and distress",
        "metadata": {
          "confidence": "high",
          "tags": ["empirical", "animal-welfare"]
        }
      },
      {
        "id": "node_4",
        "type": "premise",
        "content": "Cosmetic products are not essential for human survival",
        "metadata": {
          "confidence": "high",
          "tags": ["necessity"]
        }
      },
      {
        "id": "node_5",
        "type": "premise",
        "content": "Suffering cannot be morally justified when the product is non-essential",
        "metadata": {
          "confidence": "medium",
          "tags": ["ethics", "normative"]
        }
      },
      {
        "id": "node_6",
        "type": "objection",
        "content": "Animal testing ensures product safety for consumers",
        "metadata": {
          "confidence": "medium",
          "tags": ["safety", "consumer-protection"]
        }
      },
      {
        "id": "node_7",
        "type": "rebuttal",
        "content": "Alternative methods like in-vitro testing and computer modeling can provide safety data without animal harm",
        "metadata": {
          "confidence": "high",
          "tags": ["alternatives", "technology"]
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "from": "node_2",
        "to": "node_1",
        "relationship": "supports"
      },
      {
        "id": "edge_2",
        "from": "node_3",
        "to": "node_2",
        "relationship": "strongly_supports"
      },
      {
        "id": "edge_3",
        "from": "node_4",
        "to": "node_2",
        "relationship": "supports"
      },
      {
        "id": "edge_4",
        "from": "node_5",
        "to": "node_1",
        "relationship": "supports"
      },
      {
        "id": "edge_5",
        "from": "node_4",
        "to": "node_5",
        "relationship": "supports"
      },
      {
        "id": "edge_6",
        "from": "node_6",
        "to": "node_1",
        "relationship": "opposes"
      },
      {
        "id": "edge_7",
        "from": "node_7",
        "to": "node_6",
        "relationship": "rebuts"
      }
    ]
  }
}
```

---

## Example 6: Comparative Argument

**Text:**
"Electric vehicles are superior to gasoline vehicles. EVs produce zero direct emissions, reducing air pollution. They cost less to maintain because they have fewer moving parts. While EVs currently have higher upfront costs, government incentives reduce the price gap, and lower fuel costs mean total ownership costs are comparable."

**Argument Map:**

```json
{
  "argument_map": {
    "title": "Electric Vehicles vs Gasoline Vehicles",
    "description": "Comparative argument favoring electric vehicles on environmental and economic grounds",
    "nodes": [
      {
        "id": "node_1",
        "type": "claim",
        "content": "Electric vehicles are superior to gasoline vehicles",
        "metadata": {
          "confidence": "medium",
          "tags": ["transportation", "comparison", "normative"]
        }
      },
      {
        "id": "node_2",
        "type": "premise",
        "content": "EVs produce zero direct emissions, reducing air pollution",
        "metadata": {
          "confidence": "high",
          "tags": ["environment", "emissions"]
        }
      },
      {
        "id": "node_3",
        "type": "premise",
        "content": "EVs cost less to maintain because they have fewer moving parts",
        "metadata": {
          "confidence": "high",
          "tags": ["economics", "maintenance"]
        }
      },
      {
        "id": "node_4",
        "type": "objection",
        "content": "EVs have higher upfront costs than gasoline vehicles",
        "metadata": {
          "confidence": "high",
          "tags": ["economics", "cost"]
        }
      },
      {
        "id": "node_5",
        "type": "rebuttal",
        "content": "Government incentives reduce the upfront price gap",
        "metadata": {
          "confidence": "high",
          "tags": ["policy", "incentives"]
        }
      },
      {
        "id": "node_6",
        "type": "rebuttal",
        "content": "Lower fuel costs mean total ownership costs are comparable",
        "metadata": {
          "confidence": "medium",
          "tags": ["economics", "total-cost"]
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "from": "node_2",
        "to": "node_1",
        "relationship": "supports"
      },
      {
        "id": "edge_2",
        "from": "node_3",
        "to": "node_1",
        "relationship": "supports"
      },
      {
        "id": "edge_3",
        "from": "node_4",
        "to": "node_1",
        "relationship": "opposes"
      },
      {
        "id": "edge_4",
        "from": "node_5",
        "to": "node_4",
        "relationship": "rebuts"
      },
      {
        "id": "edge_5",
        "from": "node_6",
        "to": "node_4",
        "relationship": "rebuts"
      }
    ]
  }
}
```

---

## Example 7: Minimal Argument (Edge Case)

**Text:**
"Coffee is good."

**Argument Map:**

```json
{
  "argument_map": {
    "title": "Coffee is Good",
    "description": "Minimal unsupported claim about coffee",
    "nodes": [
      {
        "id": "node_1",
        "type": "claim",
        "content": "Coffee is good",
        "metadata": {
          "confidence": "low",
          "tags": ["opinion", "unsupported"]
        }
      }
    ],
    "edges": []
  }
}
```

---

## Example 8: Argument with Clarification

**Text:**
"We should adopt agile methodology in our development process. Agile refers to iterative development where requirements evolve through collaboration. This approach reduces risk by delivering working software frequently, allowing for early detection of problems."

**Argument Map:**

```json
{
  "argument_map": {
    "title": "Adopting Agile Methodology",
    "description": "Advocates for agile development based on risk reduction through iterative delivery",
    "nodes": [
      {
        "id": "node_1",
        "type": "claim",
        "content": "We should adopt agile methodology in our development process",
        "metadata": {
          "confidence": "medium",
          "tags": ["software", "methodology", "normative"]
        }
      },
      {
        "id": "node_2",
        "type": "clarification",
        "content": "Agile refers to iterative development where requirements evolve through collaboration",
        "metadata": {
          "confidence": "high",
          "tags": ["definition", "methodology"]
        }
      },
      {
        "id": "node_3",
        "type": "premise",
        "content": "Agile reduces risk by delivering working software frequently",
        "metadata": {
          "confidence": "medium",
          "tags": ["risk", "delivery"]
        }
      },
      {
        "id": "node_4",
        "type": "premise",
        "content": "Frequent delivery allows for early detection of problems",
        "metadata": {
          "confidence": "high",
          "tags": ["quality", "feedback"]
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "from": "node_2",
        "to": "node_1",
        "relationship": "clarifies"
      },
      {
        "id": "edge_2",
        "from": "node_3",
        "to": "node_1",
        "relationship": "supports"
      },
      {
        "id": "edge_3",
        "from": "node_4",
        "to": "node_3",
        "relationship": "supports"
      }
    ]
  }
}
```

---

## Example 9: Argument with Strong Refutation

**Text:**
"Homeopathy is ineffective as medicine. Multiple systematic reviews have found no evidence that homeopathic remedies work better than placebo. The proposed mechanism—extreme dilution making substances more potent—violates basic principles of chemistry and physics."

**Argument Map:**

```json
{
  "argument_map": {
    "title": "Homeopathy's Ineffectiveness",
    "description": "Argues against homeopathy based on lack of evidence and implausible mechanism",
    "nodes": [
      {
        "id": "node_1",
        "type": "claim",
        "content": "Homeopathy is ineffective as medicine",
        "metadata": {
          "confidence": "high",
          "tags": ["medicine", "science", "empirical"]
        }
      },
      {
        "id": "node_2",
        "type": "premise",
        "content": "Homeopathic remedies perform no better than placebo",
        "metadata": {
          "confidence": "high",
          "tags": ["efficacy", "evidence"]
        }
      },
      {
        "id": "node_3",
        "type": "evidence",
        "content": "Multiple systematic reviews have found no evidence of effectiveness beyond placebo",
        "metadata": {
          "confidence": "high",
          "tags": ["meta-analysis", "empirical"]
        }
      },
      {
        "id": "node_4",
        "type": "premise",
        "content": "The proposed mechanism violates basic principles of chemistry and physics",
        "metadata": {
          "confidence": "high",
          "tags": ["mechanism", "science"]
        }
      },
      {
        "id": "node_5",
        "type": "clarification",
        "content": "Homeopathy's mechanism proposes extreme dilution makes substances more potent",
        "metadata": {
          "confidence": "high",
          "tags": ["mechanism", "definition"]
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "from": "node_2",
        "to": "node_1",
        "relationship": "strongly_supports"
      },
      {
        "id": "edge_2",
        "from": "node_3",
        "to": "node_2",
        "relationship": "strongly_supports"
      },
      {
        "id": "edge_3",
        "from": "node_4",
        "to": "node_1",
        "relationship": "strongly_supports"
      },
      {
        "id": "edge_4",
        "from": "node_5",
        "to": "node_4",
        "relationship": "clarifies"
      }
    ]
  }
}
```

---

## Example 10: Balanced Two-Sided Argument

**Text:**
"The debate over artificial intelligence safety is complex. On one hand, AI could help solve major challenges like climate change and disease. On the other hand, advanced AI systems could pose existential risks if not properly aligned with human values. Both perspectives deserve serious consideration in policymaking."

**Argument Map:**

```json
{
  "argument_map": {
    "title": "AI Safety Debate",
    "description": "Balanced presentation of both benefits and risks of artificial intelligence",
    "nodes": [
      {
        "id": "node_1",
        "type": "claim",
        "content": "Both AI benefits and risks deserve serious consideration in policymaking",
        "metadata": {
          "confidence": "high",
          "tags": ["policy", "ai", "normative"]
        }
      },
      {
        "id": "node_2",
        "type": "premise",
        "content": "AI could help solve major challenges like climate change and disease",
        "metadata": {
          "confidence": "medium",
          "tags": ["benefits", "potential"]
        }
      },
      {
        "id": "node_3",
        "type": "premise",
        "content": "Advanced AI systems could pose existential risks if not properly aligned with human values",
        "metadata": {
          "confidence": "medium",
          "tags": ["risk", "safety", "alignment"]
        }
      },
      {
        "id": "node_4",
        "type": "premise",
        "content": "The debate over AI safety involves significant uncertainty and complexity",
        "metadata": {
          "confidence": "high",
          "tags": ["complexity", "uncertainty"]
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "from": "node_2",
        "to": "node_1",
        "relationship": "supports"
      },
      {
        "id": "edge_2",
        "from": "node_3",
        "to": "node_1",
        "relationship": "supports"
      },
      {
        "id": "edge_3",
        "from": "node_4",
        "to": "node_1",
        "relationship": "supports"
      }
    ]
  }
}
```

---

## Usage Notes

### When to Use Each Example

- **Example 1**: Simple cause-and-effect arguments
- **Example 2**: Arguments anticipating objections
- **Example 3**: Complex policy debates with multiple layers
- **Example 4**: Scientific/technical arguments with empirical evidence
- **Example 5**: Ethical or moral arguments
- **Example 6**: Comparative evaluations
- **Example 7**: Minimal input requiring basic structure
- **Example 8**: Arguments requiring term definitions
- **Example 9**: Arguments against established positions
- **Example 10**: Balanced presentation of multiple perspectives

### Common Patterns Across Examples

1. Main claim is always present
2. Supporting premises connect to claims
3. Evidence supports premises
4. Objections target claims
5. Rebuttals target objections
6. Clarifications provide context

### Adapting Examples

You can adapt these examples by:
- Changing the topic while keeping the structure
- Adding more premises or objections
- Increasing or decreasing complexity
- Adjusting confidence levels based on evidence strength
- Adding or removing evidence nodes
