"""Human-inspected region IDs; intended targets fixed before scoring selection."""

import json
from pathlib import Path

Q = []


def add(scene, category, items):
    for query, ids in items:
        Q.append(
            dict(
                scene=scene,
                category=category,
                query=query,
                acceptableRegions=ids,
                split="holdout" if len(Q) % 4 == 3 else "selection",
            )
        )


add(
    "desk",
    "literal",
    [
        ("a coffee mug", [9]),
        ("a smartphone", [11, 13]),
        ("a book", [23, 28, 29, 31, 33]),
        ("a straw hat", [18, 19]),
        ("a computer screen", [14]),
    ],
)
add(
    "kitchen",
    "literal",
    [
        ("a cucumber", [1]),
        ("a tomato", [2, 3, 13, 14, 15, 21, 27, 40, 45]),
        ("a fork", [19]),
        ("broccoli", [34, 36, 39, 44, 46, 47, 52, 53]),
        ("a slice of lime", [42]),
    ],
)
add(
    "harvest",
    "attribute",
    [
        ("something orange", [14, 15, 18, 19, 20, 24, 27, 29]),
        ("something purple", [5, 7, 8, 25]),
        ("something leafy", [6, 11, 12, 17, 22, 23, 26, 28]),
        ("something round", [9, 13, 21, 25, 27, 29, 32]),
        ("something green", [6, 9, 11, 12, 17, 21, 22, 23, 26, 28, 30, 31, 34]),
    ],
)
add(
    "desk",
    "function",
    [
        ("something used to communicate", [11, 13, 14]),
        ("something I can drink from", [9]),
        ("something I can read", [23, 28, 29, 31, 33]),
        ("something that protects me from the sun", [18, 19]),
        ("something used for online research", [14]),
    ],
)
add(
    "living-room",
    "affordance",
    [
        ("something I could sit on", [14, 16, 17, 18, 19]),
        ("something I could lie down on", [16]),
        ("something I could place a cup on", [22]),
        ("something I could look through", [9, 11, 12]),
        ("something I could climb", [3, 20, 21, 25]),
    ],
)
add(
    "street",
    "abstract",
    [
        ("something associated with transportation", [20, 21]),
        ("something associated with pedestrian safety", [22]),
        ("something associated with urban architecture", [1, 6, 8, 10, 13, 18]),
        ("something associated with advertising", [5, 7, 9, 14, 15, 16, 17, 19]),
        ("something associated with nature", [12, 13]),
    ],
)
add(
    "living-room",
    "difficult",
    [
        ("something that tells me how much time has passed", [10]),
        ("somewhere I could rest after a long day", [16]),
        ("something that makes the room feel warmer", [16, 17, 18, 19]),
        ("something reflecting the world outside", [9, 11, 12]),
        ("something that would be difficult for a small robot to move", [16]),
    ],
)
add(
    "electrical",
    "function",
    [
        ("something used to tighten screws", [4, 10, 11, 12, 13, 14, 15, 16, 17, 19]),
        ("something used to grip wires", [2, 7, 9, 18]),
        ("something that connects electrical wires", [6, 8, 20, 22, 23]),
        ("something that carries electricity", [21, 24]),
        ("the screwdriver", [4, 10, 11, 12, 13, 14, 15, 16, 17, 19]),
    ],
)
Path(__file__).with_name("queries.json").write_text(json.dumps(Q, indent=2) + "\n")
