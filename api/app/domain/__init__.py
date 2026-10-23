"""Pure business rules. No web, database or network imports.

| Module       | Rules                                              |
| ------------ | -------------------------------------------------- |
| window       | BR-1 window (day 30 counts), BR-5 claim deadline   |
| refund       | BR-9 quantity limits, refund due                   |
| exclusions   | BR-6 excluded items                                |
| flagging     | FR-18 combining BR-1, BR-2, BR-3, BR-5, BR-6, BR-9 |
| claims       | BR-8 claim status flow, alert accuracy             |
"""
