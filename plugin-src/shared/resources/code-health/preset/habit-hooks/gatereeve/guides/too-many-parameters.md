This signature has more than 5 parameters. Values that travel together are usually a missing domain concept.

Look at the call sites: if several parameters always appear together, find, or create, the object they belong to, give it a domain name, and pass that instead. If one existing object already owns most of them, this function may belong on it. An options bag named after the function (`FooOptions`) just renames the list; it is done when the concept has a real name and no call site passes its fields loose.

{% include "includes/line_level_issues.md" %}
