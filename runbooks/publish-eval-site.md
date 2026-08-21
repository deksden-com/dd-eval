# Publish an eval report site

Publishing is optional and begins only after a user explicitly asks for a site.
The agent responsible for that request is the Site owner and uses Sites; the
Controller does not delegate Sites operations to a subagent.

## Inputs

Give the Site owner the selected immutable `report.json`, its Markdown report,
accepted Judge/comparison results, and
[the evaluation methodology](../methodology/evaluation-methodology.md). The
selected model or models and stage scope come from the user's request. When the
request does not narrow the scope, show all models and completed stages in the
report.

The site is an editorial projection. `dd-eval` does not generate site source,
charts or a separate visual-data format.

## Required page order

1. title, scope and version identity;
2. concise main conclusion;
3. infographic: outcome, flow, efficiency, stage matrix and material findings;
4. golden coverage and proposed improvements;
5. complete textual report: objective, setup, methodology, stage and E2E
   analysis, comparison, findings, limitations and technical appendix.

For a single model, prioritize the detailed stage analysis. For a comparison,
prioritize side-by-side model evidence. Outcome and Flow use different charts;
efficiency is factual supporting data rather than a quality score.

## Publishing procedure

1. Build the site with Sites using `prompts/roles/report-site.md`.
2. Verify the report data, mobile layout and accessible numeric alternatives to
   charts.
3. Publish only with the access level explicitly requested or approved by the
   user.
4. Write `publication.json` next to the report with the report hash,
   methodology hash, URL, access level and publication time. Do not modify the
   immutable report to add publication metadata.
