import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ManifestExporter } from "./manifest-exporter.js";
import type { ReviewManifest } from "./manifest.js";
import { verifyProjectArtifacts } from "./project-builder.js";
import { staleCurrentReviewSubjects } from "./review-ledger.js";

const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>Claim Ledger — review record</title>
  <style>
    :root {
      --paper: #f5f2ea;
      --sheet: #fffefb;
      --ink: #1d211e;
      --muted: #696d67;
      --hairline: #d9d5ca;
      --green: #2e5741;
      --green-wash: #edf2ed;
      --ochre: #8a651f;
      --ochre-wash: #f7f0df;
      --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
      --sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
      --mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    }
    * { box-sizing: border-box; }
    html { background: var(--paper); }
    body { margin: 0; color: var(--ink); background: var(--paper); font-family: var(--sans); -webkit-font-smoothing: antialiased; }
    .topbar { height: 52px; border-bottom: 1px solid var(--hairline); background: rgba(255,254,251,.92); }
    .topbar-inner { width: min(1180px, calc(100% - 48px)); height: 100%; margin: auto; display: flex; align-items: center; justify-content: space-between; }
    .wordmark { font: 600 14px/1 var(--serif); letter-spacing: .01em; }
    .topbar-meta { color: var(--muted); font: 500 11px/1 var(--sans); letter-spacing: .08em; text-transform: uppercase; }
    .hero { width: min(1180px, calc(100% - 48px)); margin: 0 auto; padding: 58px 0 42px; border-bottom: 1px solid var(--ink); }
    .kicker { margin: 0 0 17px; color: var(--green); font-size: 11px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
    h1 { max-width: 800px; margin: 0; font: 400 clamp(42px, 6vw, 72px)/.98 var(--serif); letter-spacing: -.035em; }
    .hero-meta { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-top: 28px; color: var(--muted); font-size: 13px; }
    .hero-meta span + span { position: relative; }
    .hero-meta span + span::before { content: ""; position: absolute; left: -13px; top: 7px; width: 3px; height: 3px; border-radius: 50%; background: #a6a69e; }
    .fixture-note { width: min(1180px, calc(100% - 48px)); margin: 18px auto 0; padding: 12px 0; color: var(--muted); font-size: 12px; border-bottom: 1px solid var(--hairline); }
    .fixture-note strong { color: var(--ink); font-weight: 650; }
    .layout { width: min(1180px, calc(100% - 48px)); margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) 292px; gap: 70px; padding: 52px 0 84px; align-items: start; }
    .section-heading { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 13px; border-bottom: 1px solid var(--ink); }
    .section-heading h2 { margin: 0; font: 500 15px/1.2 var(--sans); }
    .section-heading span { color: var(--muted); font-size: 12px; }
    .claim-record { display: grid; grid-template-columns: 48px minmax(0,1fr); gap: 18px; padding: 34px 0 38px; border-bottom: 1px solid var(--hairline); }
    .claim-number { padding-top: 3px; color: #91938e; font: 500 12px/1 var(--mono); }
    .claim-type { color: var(--muted); font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
    .claim-text { max-width: 760px; margin: 10px 0 18px; font: 400 clamp(23px, 3vw, 31px)/1.24 var(--serif); letter-spacing: -.015em; }
    .decision { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 650; }
    .decision::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #a8aaa5; }
    .decision.approve { color: var(--green); }
    .decision.approve::before { background: var(--green); }
    .decision.reject { color: #873c35; }
    .decision.reject::before { background: #873c35; }
    .decision.waive { color: var(--ochre); }
    .decision.waive::before { background: var(--ochre); }
    .evidence-record { margin-top: 26px; border-left: 2px solid #a7b7a9; background: var(--sheet); box-shadow: inset 0 0 0 1px #e4e0d6; }
    .evidence-head { display: flex; justify-content: space-between; gap: 16px; padding: 13px 17px; border-bottom: 1px solid #e4e0d6; color: var(--muted); font-size: 11px; letter-spacing: .04em; }
    .assessment-label { color: var(--green); font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
    blockquote { margin: 0; padding: 23px 26px 20px; font: 400 18px/1.5 var(--serif); }
    .evidence-foot { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 1px; background: #e4e0d6; border-top: 1px solid #e4e0d6; }
    .evidence-fact { min-height: 67px; padding: 13px 17px; background: #faf9f4; }
    .evidence-fact span { display: block; margin-bottom: 5px; color: var(--muted); font-size: 10px; letter-spacing: .07em; text-transform: uppercase; }
    .evidence-fact strong { font-size: 13px; font-weight: 650; }
    .relations { margin-top: 54px; }
    .relation-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: 18px; align-items: center; padding: 22px 0; border-bottom: 1px solid var(--hairline); }
    .relation-claim { font: 400 17px/1.35 var(--serif); }
    .relation-word { padding: 5px 9px; color: var(--green); border: 1px solid #aebcaf; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .relation-review { grid-column: 1 / -1; }
    aside { position: sticky; top: 28px; }
    .signoff { border-top: 3px solid var(--ink); border-bottom: 1px solid var(--ink); padding: 21px 0 24px; }
    .signoff-label { margin: 0 0 13px; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .signoff-state { margin: 0; font: 400 31px/1.05 var(--serif); }
    .signoff.complete .signoff-state { color: var(--green); }
    .progress { margin: 22px 0 9px; height: 3px; background: #ddd9cf; }
    .progress > span { display: block; height: 100%; background: var(--green); }
    .progress-copy { display: flex; justify-content: space-between; color: var(--muted); font-size: 11px; }
    .scope { margin: 22px 0 0; color: #4f534e; font: 400 14px/1.55 var(--serif); }
    .reviewer { margin-top: 19px; padding-top: 17px; border-top: 1px solid var(--hairline); }
    .reviewer strong { display: block; font: 500 15px/1.3 var(--sans); }
    .reviewer span { color: var(--muted); font-size: 11px; }
    .facts { margin: 28px 0 0; }
    .fact { padding: 13px 0; border-bottom: 1px solid var(--hairline); }
    .fact dt { margin-bottom: 5px; color: var(--muted); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
    .fact dd { margin: 0; font-size: 12px; line-height: 1.4; }
    .hash { font-family: var(--mono); font-size: 10px; }
    .boundary { margin-top: 30px; padding: 17px; background: var(--ochre-wash); border-left: 2px solid #b38a3c; color: #5d4b29; font-size: 12px; line-height: 1.5; }
    .error { color: #873c35; font-size: 14px; }
    footer { border-top: 1px solid var(--hairline); }
    .footer-inner { width: min(1180px, calc(100% - 48px)); margin: auto; padding: 22px 0 38px; display: flex; justify-content: space-between; gap: 20px; color: var(--muted); font-size: 11px; }
    @media (max-width: 820px) {
      .topbar-inner, .hero, .fixture-note, .layout, .footer-inner { width: min(100% - 32px, 680px); }
      .hero { padding: 42px 0 32px; }
      .layout { grid-template-columns: 1fr; gap: 48px; padding-top: 38px; }
      aside { position: static; grid-row: 1; }
      .signoff { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
      .signoff-label, .scope, .reviewer { grid-column: 1 / -1; }
      .progress { align-self: end; margin: 0 0 9px; }
      .claim-record { grid-template-columns: 32px minmax(0,1fr); gap: 10px; }
    }
    @media (max-width: 540px) {
      .topbar-inner, .hero, .fixture-note, .layout, .footer-inner { width: calc(100% - 28px); }
      .topbar-meta { display: none; }
      h1 { font-size: 42px; }
      .hero-meta { display: grid; gap: 7px; }
      .hero-meta span + span::before { display: none; }
      .claim-record { display: block; }
      .claim-number { margin-bottom: 12px; }
      .evidence-foot { grid-template-columns: 1fr; }
      .relation-row { grid-template-columns: 1fr; gap: 10px; }
      .relation-word { width: fit-content; }
      .signoff { display: block; }
      .progress { margin-top: 22px; }
      .footer-inner { display: block; }
      .footer-inner span { display: block; margin-top: 6px; }
    }
  </style>
</head>
<body>
  <div class="topbar"><div class="topbar-inner"><div class="wordmark">Claim Ledger</div><div class="topbar-meta">Exact-version review record</div></div></div>
  <header class="hero">
    <p class="kicker">Evidence review</p>
    <h1>Document evidence record</h1>
    <div class="hero-meta" id="hero-meta"><span>Loading review…</span></div>
  </header>
  <div class="fixture-note"><strong>Synthetic review fixture.</strong> No sensitive or production data. Automated assessments are never human approvals.</div>
  <main class="layout">
    <div>
      <div class="section-heading"><h2>Claims and evidence</h2><span id="claim-count"></span></div>
      <section id="claims" aria-live="polite"></section>
      <section class="relations" id="relations"></section>
    </div>
    <aside id="sidebar" aria-live="polite"></aside>
  </main>
  <footer><div class="footer-inner"><strong>Claim Ledger v0</strong><span>Local processing · read-only static record</span></div></footer>
  <script type="module">
    const escapeHtml = value => String(value).replace(/[&<>\"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[character]));
    const titleCase = value => String(value).replace(/[-_]/g, ' ').replace(/\\.[^.]+$/, '').replace(/\\b\\w/g, character => character.toUpperCase());
    const shortHash = value => value.slice(0, 10)+'…'+value.slice(-8);
    const currentActions = data => {
      const actions = new Map();
      for (const action of data.reviewActions) actions.set(action.subjectType+':'+action.subjectId, action);
      return actions;
    };
    const decisionMarkup = (action, prefix='Human review') => {
      const decision = action?.decision ?? 'pending';
      return '<span class="decision '+escapeHtml(decision)+'">'+escapeHtml(prefix)+': '+escapeHtml(decision)+'</span>';
    };
    try {
      const response = await fetch('./manifest.json');
      if (!response.ok) throw new Error('The review manifest could not be loaded.');
      const data = await response.json();
      const actions = currentActions(data);
      const reviewableCount = data.claims.length + data.evidenceRelations.length + data.argumentEdges.length;
      const approvedCount = [...actions.values()].filter(action => action.subjectType !== 'document' && action.decision === 'approve').length;
      const certificationAction = data.certification ? data.reviewActions.find(action => action.id === data.certification.reviewActionId) : null;
      const sources = new Map(data.sources.map(source => [source.id, source]));
      const claimNumbers = new Map(data.claims.map((claim, index) => [claim.id, String(index + 1).padStart(2, '0')]));

      document.querySelector('h1').textContent = titleCase(data.document.name);
      document.querySelector('#hero-meta').innerHTML = [
        data.reviewId,
        data.document.mediaType.replace('text/', '').toUpperCase(),
        data.sources.length+' source '+(data.sources.length === 1 ? 'document' : 'documents'),
        'Created '+new Date(data.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
      ].map(value => '<span>'+escapeHtml(value)+'</span>').join('');
      document.querySelector('#claim-count').textContent = data.claims.length+' claims · '+data.evidenceRelations.length+' evidence checks';

      document.querySelector('#claims').innerHTML = data.claims.map((claim, claimIndex) => {
        const evidence = data.evidenceRelations.filter(item => item.claimId === claim.id);
        return '<article class="claim-record"><div class="claim-number">'+String(claimIndex+1).padStart(2,'0')+'</div><div>'+
          '<div class="claim-type">'+escapeHtml(claim.kind.replace('-', ' '))+'</div>'+
          '<h3 class="claim-text">'+escapeHtml(claim.text)+'</h3>'+
          decisionMarkup(actions.get('claim:'+claim.id), 'Claim review')+
          evidence.map((item, evidenceIndex) => {
            const source = sources.get(item.evidence.sourceArtifactId);
            const relation = item.assessment.relation.replace('_', ' ');
            return '<div class="evidence-record">'+
              '<div class="evidence-head"><span>Evidence '+(evidenceIndex+1)+' · '+escapeHtml(source?.name ?? item.evidence.sourceArtifactId)+'</span><span class="assessment-label">Automated assessment</span></div>'+
              '<blockquote>“'+escapeHtml(item.evidence.text)+'”</blockquote>'+
              '<div class="evidence-foot">'+
                '<div class="evidence-fact"><span>Relation</span><strong>'+escapeHtml(relation)+'</strong></div>'+
                '<div class="evidence-fact"><span>Source check</span><strong>'+(item.assessment.exactMatch ? 'Exact span found' : 'Quote absent')+'</strong></div>'+
                '<div class="evidence-fact"><span>Human decision</span>'+decisionMarkup(actions.get('evidence-relation:'+item.id), 'Evidence')+'</div>'+
              '</div></div>';
          }).join('')+'</div></article>';
      }).join('');

      const relations = data.argumentEdges.map(edge => {
        const from = data.claims.find(claim => claim.id === edge.fromClaimId);
        const to = data.claims.find(claim => claim.id === edge.toClaimId);
        return '<div class="relation-row"><div class="relation-claim"><span class="claim-number">'+claimNumbers.get(edge.fromClaimId)+'</span> '+escapeHtml(from?.text ?? edge.fromClaimId)+'</div><span class="relation-word">'+escapeHtml(edge.relation)+'</span><div class="relation-claim"><span class="claim-number">'+claimNumbers.get(edge.toClaimId)+'</span> '+escapeHtml(to?.text ?? edge.toClaimId)+'</div><div class="relation-review">'+decisionMarkup(actions.get('argument-edge:'+edge.id), 'Relationship review')+'</div></div>';
      }).join('');
      document.querySelector('#relations').innerHTML = '<div class="section-heading"><h2>Claim relationships</h2><span>'+data.argumentEdges.length+' recorded</span></div>'+(relations || '<p class="scope">No claim relationships recorded.</p>');

      const signoffState = data.certification ? 'Recorded' : 'Not recorded';
      const progress = reviewableCount === 0 ? 0 : Math.round((approvedCount/reviewableCount)*100);
      const scope = data.certification?.scope ?? 'Certification becomes available after each Claim, Evidence Relation, and Argument Edge is reviewed.';
      document.querySelector('#sidebar').innerHTML = '<section class="signoff '+(data.certification ? 'complete' : '')+'">'+
        '<p class="signoff-label">Review sign-off</p><p class="signoff-state">'+signoffState+'</p>'+
        '<div class="progress"><span style="width:'+progress+'%"></span></div><div class="progress-copy"><span>'+approvedCount+' of '+reviewableCount+' items approved</span><span>'+progress+'%</span></div>'+
        '<p class="scope">'+escapeHtml(scope)+' This does not establish truth, legal compliance, or clinical correctness.</p>'+
        (certificationAction ? '<div class="reviewer"><strong>'+escapeHtml(certificationAction.reviewer.displayName)+'</strong><span>'+escapeHtml(certificationAction.reviewer.identityAssurance)+' identity · '+new Date(certificationAction.at).toLocaleString('en-GB', { dateStyle:'medium', timeStyle:'short' })+'</span></div>' : '')+
        '</section><dl class="facts">'+
          '<div class="fact"><dt>Document version</dt><dd class="hash">'+escapeHtml(shortHash(data.document.sha256))+'</dd></div>'+
          '<div class="fact"><dt>Source bundle</dt><dd>'+data.sources.length+' file'+(data.sources.length === 1 ? '' : 's')+' bound by ID and SHA-256</dd></div>'+
          '<div class="fact"><dt>Automated checker</dt><dd>'+(data.toolchain.sdkVersion ? escapeHtml(data.toolchain.sdkVersion) : 'Offline deterministic fixture')+'</dd></div>'+
        '</dl><div class="boundary"><strong>Review boundary</strong><br>Automated results are evidence for a reviewer. They cannot approve a claim or create sign-off.</div>';
    } catch (error) {
      document.querySelector('#claims').innerHTML = '<p class="error">'+escapeHtml(error instanceof Error ? error.message : error)+'</p>';
    }
  </script>
</body>
</html>
`;

export async function exportStaticSite(
  manifest: ReviewManifest,
  outputDirectory: string,
  projectPath: string,
): Promise<void> {
  if (!manifest.publication.fixture) {
    throw new Error("Static publication is restricted to synthetic fixtures");
  }
  if (manifest.publication.containsSensitiveData) {
    throw new Error("Refusing to publish a manifest marked as containing sensitive data");
  }

  const exporter = await ManifestExporter.create();
  const verification = exporter.verify(manifest);
  if (!verification.valid) {
    throw new Error(`Refusing to publish invalid manifest:\n${verification.errors.join("\n")}`);
  }
  const artifacts = await verifyProjectArtifacts(projectPath, manifest);
  if (!artifacts.valid) {
    throw new Error(
      `Refusing to publish stale or mis-anchored artifacts:\n${artifacts.errors.join("\n")}`,
    );
  }
  const staleSubjects = staleCurrentReviewSubjects(manifest);
  if (staleSubjects.length > 0) {
    throw new Error(`Refusing to publish stale Review Actions: ${staleSubjects.join(", ")}`);
  }

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "index.html"), INDEX_HTML, { mode: 0o644 });
  await writeFile(
    join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o644 },
  );
}
