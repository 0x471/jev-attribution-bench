# Use Jev only for local evidence-relation classification

Jev will classify one Claim and one short source context as supports, contradicts, or says
nothing; code will locate quotations and enforce invariants, while generation and multi-hop
argument judgment remain outside this module. This sacrifices an apparently simpler “ask the
model everything” workflow in exchange for replayable typed outputs and failures that can be
localized to one relation.
