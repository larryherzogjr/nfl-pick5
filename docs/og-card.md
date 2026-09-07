# Social sharing card

Asset: `frontend/public/og-card-20260907.png` (1200 × 630 PNG).
The static Open Graph and Twitter metadata in `frontend/index.html` points to
`https://pick5.ospdy.com/og-card-20260907.png` so crawlers can read it without
JavaScript.

The card matches the current app's field green, cream, and gold branding and
uses the login page's “Your week. Your five.” headline. A condensed wordmark,
football still life, field markings, and five checked squares keep it readable
at social preview sizes.

Use a new filename for each replacement: production Nginx serves PNGs with a
one-year immutable cache. Keep the old `og-card.png` available for existing
cached previews. Both image URLs and image alt descriptions must be updated
together. The frontend's normal Vite build copies the card into `dist`;
deployment is required before social crawlers can fetch the new asset.

Created with the built-in imagegen tool, then resized to 1200 × 630 with macOS
`sips`.

## Generation prompt

```text
Use case: ads-marketing
Asset type: Production Open Graph social sharing card for the existing NFL Pick 5 web app. Create one finished flat graphic, landscape 1200:630 aspect ratio, full bleed.
Primary request: An exceptionally art-directed football pick'em poster: confident condensed sports typography, rich field green, warm cream and gold, tactile analog print character, polished contemporary editorial composition. It must read beautifully at a 600 x 315 thumbnail.
Scene/backdrop: Deep forest green (#102e24) and field green (#174b38), with very subtle paper grain and sweeping football yard markings restricted to the right half. A restrained gold accent rule at the top.
Composition: Spacious 64px safe margins. Left 60% is an organized typographic stack; right 40% is a dramatic large realistic brown leather American football seen from overhead at a diagonal, with crisp cream laces, soft directional sunlight and grounded shadow on green turf. Fine ivory yard lines behind it, subtle and authentic. The football is a beautiful editorial still life, cleanly separated from the text. No stadium crowd. The image should feel like a collectible game-day program, not a generic technology ad.
Typography: Small tracked gold uppercase eyebrow at top left reads "NFL WEEKLY PICK’EM". Below it a massive bold condensed wordmark "PICK5", with "PICK" in warm cream (#f5f3ed) and "5" in gold (#f1c86a); it dominates the left area. Use compact high-impact lettering and immaculate alignment. Under the wordmark, medium bold cream text on two lines reads "Your week." then "Your five.". Below that, smaller readable cream text on two lines reads "Five picks against the spread." then "A season of bragging rights."
Bottom detail: Exactly five small gold squares with simple dark green checkmarks in a neat row at bottom left. Small cream website text "pick5.ospdy.com" at bottom right. Keep all copy away from edges and football.
Text (verbatim, no other text): "NFL WEEKLY PICK’EM"; "PICK5"; "Your week."; "Your five."; "Five picks against the spread."; "A season of bragging rights."; "pick5.ospdy.com".
Constraints: All copy must be spelled exactly and extremely sharp. Entirely new composition. Intentional hierarchy and generous breathing room. No NFL shield, no team logos, no brand on football, no watermark, no gradients behind lettering, no glow, no glossy 3D lettering, no UI mockup, no outer mockup frame.
```
