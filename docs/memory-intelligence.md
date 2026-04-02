# Living Memory Architecture

Living Memory Architecture is MGL's defining runtime feature.

## Philosophy

MGL does not make developers choose between:

- opaque GC
- manual frees
- strict ownership syntax

Instead, MGL exposes a tracked ownership model with language-level inspection.

## What Gets Tracked

Tracked allocations can include:

- arrays
- record instances
- class instances
- modules
- functions and captured closures
- explicitly tracked scalar values

## What You Can Ask

- what is this allocation?
- how large is it?
- who owns it?
- why is it still alive?
- what changed between two snapshots?
- what optimization hints does the runtime have?
