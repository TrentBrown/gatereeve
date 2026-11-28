This function is over the project's limit (40 lines for JavaScript/TypeScript, 40 statements for Python). Length is the symptom; the smell is a function doing more than one job.

Name the distinct responsibilities first, then move each to where it belongs: its own well-named function, a method on the object that owns the data, or a small class. Avoid mechanical `helperA`/`helperB` extraction just to get under the limit; that hides the shape instead of fixing it. If the code is tangled, inlining first can show the real seams.

Write what the function does in one sentence. If you can't, it has more than one responsibility.

{% include "includes/line_level_issues.md" %}
