import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server;
let GameCard;
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
  });
  ({ default: GameCard } = await server.ssrLoadModule(
    "/src/components/GameCard.jsx",
  ));
});
after(async () => server?.close());

function renderCard({ currentPick = null, selectedSide = null, ...game } = {}) {
  return renderToStaticMarkup(
    createElement(GameCard, {
      game: {
        kickoff: new Date(Date.now() + 86_400_000).toISOString(),
        away_abbr: "KC",
        home_abbr: "SEA",
        away_team: "Kansas City Chiefs",
        home_team: "Seattle Seahawks",
        spread_home: -2.5,
        ...game,
      },
      currentPick,
      selectedSide,
      onPickChange: () => {},
    }),
  );
}

const savedPush = { picked_side: "push", spread_at_pick: -3 };

test("saved Push stays selected and removable after the market line changes", () => {
  for (const spread_home of [-2.5, 4.5, null]) {
    const html = renderCard({
      spread_home,
      currentPick: savedPush,
      selectedSide: "push",
    });
    assert.match(
      html,
      /<button type="button" aria-pressed="true" class="pick-button"><span aria-hidden="true">✓ <\/span>Push · SEA -3 · 2 pts<\/button>/,
    );
    assert.match(html, /Saved line: Push · SEA -3/);
  }
});

test("new Push selections are only offered on whole-number lines", () => {
  assert.doesNotMatch(renderCard(), /Push ·/);
  assert.match(renderCard({ spread_home: -3 }), /Push · 2 pts/);
});

test("saved Push can be restored before saving a change of side", () => {
  const html = renderCard({ currentPick: savedPush, selectedSide: "home" });
  assert.match(
    html,
    /<button type="button" aria-pressed="false" class="pick-button">Push · SEA -3 · 2 pts<\/button>/,
  );
});

test("locked saved Push remains visible and disabled", () => {
  const html = renderCard({
    currentPick: savedPush,
    selectedSide: "push",
    is_locked: true,
  });
  assert.match(
    html,
    /<button type="button" disabled="" aria-pressed="true" class="pick-button"><span aria-hidden="true">✓ <\/span>Push · SEA -3 · 2 pts<\/button>/,
  );
});
