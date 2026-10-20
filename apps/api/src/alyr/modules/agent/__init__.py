"""ALYR Agent: the business's numbers on the workspace home (ALY-99, D-035).

The Agent watches the numbers, says what changed and suggests one thing at a time, by
rules anyone can check. It is not a model and never says it thinks or notices anything.

* `facts.py` reads everything the rules need, in one business's scope, as it stood at a
  given moment.
* `insights.py` is the registry of rules: each says when it is true, how to say so in
  English and Arabic, and where to act. A new rule is one entry there.
* `view.py` turns the facts into the `AgentView` the dashboard draws: every word already
  in the reader's language, every number already formatted.
* `words.py` holds the fixed wording the view and the rules share.
"""
