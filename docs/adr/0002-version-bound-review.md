# Invalidate document sign-off after any artifact byte changes

V0 binds every Review Action and Certification to raw Artifact SHA-256 digests and invalidates
document sign-off after any draft or source byte changes. This deliberately creates review
churn for harmless edits, but avoids the harder and riskier claim that an old approval remains
valid after content changes; granular carry-forward is deferred until it can be tested separately.
Certification binds to a canonical digest of the complete review state before the Certification
field is attached, avoiding an impossible self-referential manifest hash.
