# RC UI audit — measured steps

Headed Edge; goTo/visitSecret/nearVehicle are QA hooks; E/menu/vehicle/railing use real inputs. Full keyboard journey is separate. Screenshots require human visual review.

Status: FAIL; browser: 157.0.4341.42

| Status | Locale | Step | Evidence / result |
|---|---|---|---|
| PASS | vi | intro-full | {"mode":"full","loadingMode":"loading","loadingText":"Đang tải thế giới…","loadingObserved":true,"skipHookUsed":false} · [image](vi-intro-full.webp) |
| PASS | vi | exit-after-full-intro | {} · [image](vi-exit-after-full-intro.webp) |
| PASS | vi | intro-skip-real | {"mode":"skip","loadingMode":"loading","loadingText":"Đang tải thế giới…","loadingObserved":true,"skipHookUsed":false} · [image](vi-intro-skip-real.webp) |
| PASS | vi | zone-first-light-high | {"travel":"QA goTo","zone":"first-light","position":{"x":8.997187614440918,"y":8.20897102355957,"z":-0.12724675238132477}} · [image](vi-zone-first-light-high.webp) |
| PASS | vi | overlay-first-light-key-e | {"approach":"real WASD search","forward":4,"right":0,"hint":"E — Lời chào đầu","openedBy":"real E"} · [image](vi-overlay-first-light-key-e.webp) |
| PASS | vi | overlay-first-light-close | {} · [image](vi-overlay-first-light-close.webp) |
| PASS | vi | zone-workshop-high | {"travel":"QA goTo","zone":"workshop","position":{"x":57.71809768676758,"y":7.152338981628418,"z":-132.1659698486328}} · [image](vi-zone-workshop-high.webp) |
| PASS | vi | overlay-workshop-key-e | {"approach":"real WASD search","forward":4,"right":3,"hint":"E — Bàn thợ cạnh suối","openedBy":"real E"} · [image](vi-overlay-workshop-key-e.webp) |
| PASS | vi | overlay-workshop-close | {} · [image](vi-overlay-workshop-close.webp) |
| PASS | vi | zone-roots-high | {"travel":"QA goTo","zone":"roots","position":{"x":21.03185272216797,"y":6.819667816162109,"z":-173.35482788085938}} · [image](vi-zone-roots-high.webp) |
| PASS | vi | overlay-roots-key-e | {"approach":"real WASD search","forward":4,"right":0,"hint":"E — Gốc rễ","openedBy":"real E"} · [image](vi-overlay-roots-key-e.webp) |
| PASS | vi | overlay-roots-close | {} · [image](vi-overlay-roots-close.webp) |
| PASS | vi | zone-milestones-high | {"travel":"QA goTo","zone":"milestones","position":{"x":-16.91104507446289,"y":6.553685665130615,"z":-205.79647827148438}} · [image](vi-zone-milestones-high.webp) |
| FAIL | vi | overlay-milestones-key-e | Error: No content hint after real-key approach at milestones; last hint=. No synthetic content fallback used. · [image](vi-overlay-milestones-key-e.webp) |
| PASS | vi | overlay-milestones-close | {} · [image](vi-overlay-milestones-close.webp) |
| PASS | vi | zone-old-trail-high | {"travel":"QA goTo","zone":"old-trail","position":{"x":10.716480255126953,"y":4.671377182006836,"z":-442.1573486328125}} · [image](vi-zone-old-trail-high.webp) |
| PASS | vi | overlay-old-trail-key-e | {"approach":"real WASD search","forward":4,"right":0,"hint":"E — Cột mốc đường cũ","openedBy":"real E"} · [image](vi-overlay-old-trail-key-e.webp) |
| PASS | vi | overlay-old-trail-close | {} · [image](vi-overlay-old-trail-close.webp) |
| PASS | vi | zone-horizon-high | {"travel":"QA goTo","zone":"horizon","position":{"x":47.72416687011719,"y":3.041001558303833,"z":-646.13818359375}} · [image](vi-zone-horizon-high.webp) |
| PASS | vi | overlay-horizon-key-e | {"approach":"real WASD search","forward":4,"right":3,"hint":"E — Ống nhòm nhìn ra biển","openedBy":"real E"} · [image](vi-overlay-horizon-key-e.webp) |
| PASS | vi | overlay-horizon-close | {} · [image](vi-overlay-horizon-close.webp) |
| PASS | vi | zone-quiet-shore-high | {"travel":"QA goTo","zone":"quiet-shore","position":{"x":26.75743293762207,"y":1.952019214630127,"z":-778.3305053710938}} · [image](vi-zone-quiet-shore-high.webp) |
| PASS | vi | overlay-quiet-shore-key-e | {"approach":"real WASD search","forward":7,"right":3,"hint":"E — Piano trên hiên hướng biển","openedBy":"real E"} · [image](vi-overlay-quiet-shore-key-e.webp) |
| PASS | vi | overlay-quiet-shore-close | {} · [image](vi-overlay-quiet-shore-close.webp) |
| PASS | vi | zone-last-postcard-high | {"travel":"QA goTo","zone":"last-postcard","position":{"x":7.9608564376831055,"y":1.688770055770874,"z":-895.9990844726562}} · [image](vi-zone-last-postcard-high.webp) |
| PASS | vi | overlay-last-postcard-key-e | {"approach":"real WASD search","forward":4,"right":0,"hint":"E — Hộp thư cuối đường","openedBy":"real E"} · [image](vi-overlay-last-postcard-key-e.webp) |
| PASS | vi | overlay-last-postcard-close | {} · [image](vi-overlay-last-postcard-close.webp) |
| PASS | vi | journal | {} · [image](vi-journal.webp) |
| PASS | vi | menu-quality-low | {} · [image](vi-menu-quality-low.webp) |
| PASS | vi | menu-quality-balanced | {} · [image](vi-menu-quality-balanced.webp) |
| PASS | vi | menu-quality-high | {} · [image](vi-menu-quality-high.webp) |
| PASS | vi | menu-reduced-motion | {} · [image](vi-menu-reduced-motion.webp) |
| PASS | vi | menu-sound | {"audibleSound":"manual review required"} · [image](vi-menu-sound.webp) |
| PASS | vi | menu-language | {} · [image](vi-menu-language.webp) |
| PASS | vi | chooser-key-e | {} · [image](vi-chooser-key-e.webp) |
| PASS | vi | bike-mount | {} · [image](vi-bike-mount.webp) |
| PASS | vi | bike-manual-movement | {"before":{"x":11.691105842590332,"y":8.187533378601074,"z":-0.9578453898429871},"after":{"x":18.417024612426758,"y":8.102580070495605,"z":-12.546379089355469},"metres":13.398958788024329} · [image](vi-bike-manual-movement.webp) |
| PASS | vi | bike-cruise | {"before":{"x":18.89899253845215,"y":8.09675121307373,"z":-13.319986343383789},"after":{"x":26.056312561035156,"y":8.007877349853516,"z":-24.336027145385742},"metres":13.136985379341771} · [image](vi-bike-cruise.webp) |
| PASS | vi | bike-brake | {"drift":0} · [image](vi-bike-brake.webp) |
| PASS | vi | bike-dismount | {} · [image](vi-bike-dismount.webp) |
| PASS | vi | secret-page-not-yet | {"method":"QA visitSecret; early page must not trigger ending"} · [image](vi-secret-page-not-yet.webp) |
| PASS | vi | secret-reflection | {"method":"QA visitSecret","id":"reflection","discoveries":[{"id":"reflection","count":1}]} · [image](vi-secret-reflection.webp) |
| PASS | vi | secret-forgotten-sound | {"method":"QA visitSecret","id":"forgotten-sound","discoveries":[{"id":"reflection","count":1},{"id":"forgotten-sound","count":2}]} · [image](vi-secret-forgotten-sound.webp) |
| PASS | vi | secret-unmarked-road | {"method":"QA visitSecret","id":"unmarked-road","discoveries":[{"id":"reflection","count":1},{"id":"forgotten-sound","count":2},{"id":"unmarked-road","count":3}]} · [image](vi-secret-unmarked-road.webp) |
| PASS | vi | secret-unwritten-page | {"method":"QA visitSecret","id":"unwritten-page","discoveries":[{"id":"reflection","count":1},{"id":"forgotten-sound","count":2},{"id":"unmarked-road","count":3},{"id":"unwritten-page","count":4}]} · [image](vi-secret-unwritten-page.webp) |
| PASS | vi | ending-full | {} · [image](vi-ending-full.webp) |
| PASS | vi | railing-real-key-approach | {} · [image](vi-railing-real-key-approach.webp) |
| PASS | vi | railing-exit | {} · [image](vi-railing-exit.webp) |
| PASS | vi | exit-world | {} · [image](vi-exit-world.webp) |
| PASS | vi | desktop-welcome | {} · [image](vi-desktop-welcome.webp) |
| PASS | vi | desktop-quick | {} · [image](vi-desktop-quick.webp) |
| FAIL | vi | cv-links | Error: CV PDF link present on Quick  expect(received).toBeGreaterThan(expected)  Expected: > 0 Received:   0 · [image](vi-cv-links.webp) |
| PASS | vi | case-links-present | {"links":["http://127.0.0.1:4185/vi/projects/cms-devops-platform-aws-eks/","http://127.0.0.1:4185/vi/projects/partner-data-gateway-azure/","http://127.0.0.1:4185/vi/projects/insighthub-rag/","http://127.0.0.1:4185/vi/projects/aws-sales-data-pipeline/"]} · [image](vi-case-links-present.webp) |
| PASS | vi | case-study-1 | {"href":"http://127.0.0.1:4185/vi/projects/cms-devops-platform-aws-eks/"} · [image](vi-case-study-1.webp) |
| PASS | vi | case-study-2 | {"href":"http://127.0.0.1:4185/vi/projects/partner-data-gateway-azure/"} · [image](vi-case-study-2.webp) |
| PASS | vi | case-study-3 | {"href":"http://127.0.0.1:4185/vi/projects/insighthub-rag/"} · [image](vi-case-study-3.webp) |
| PASS | vi | case-study-4 | {"href":"http://127.0.0.1:4185/vi/projects/aws-sales-data-pipeline/"} · [image](vi-case-study-4.webp) |
| PASS | vi | uncaught-errors | {"errors":[]} · [image](vi-uncaught-errors.webp) |
| PASS | vi | mobile-390-welcome | {} · [image](vi-mobile-390-welcome.webp) |
| PASS | vi | mobile-390-quick | {} · [image](vi-mobile-390-quick.webp) |
| PASS | vi | mobile-320-welcome | {} · [image](vi-mobile-320-welcome.webp) |
| PASS | vi | mobile-320-quick | {} · [image](vi-mobile-320-quick.webp) |
| PASS | en | intro-full | {"mode":"full","loadingMode":"loading","loadingText":"Loading the world…","loadingObserved":true,"skipHookUsed":false} · [image](en-intro-full.webp) |
| PASS | en | exit-after-full-intro | {} · [image](en-exit-after-full-intro.webp) |
| PASS | en | intro-skip-real | {"mode":"skip","loadingMode":"loading","loadingText":"Loading the world…","loadingObserved":true,"skipHookUsed":false} · [image](en-intro-skip-real.webp) |
| PASS | en | zone-first-light-high | {"travel":"QA goTo","zone":"first-light","position":{"x":8.997187614440918,"y":8.20906925201416,"z":-0.12724615633487701}} · [image](en-zone-first-light-high.webp) |
| PASS | en | overlay-first-light-key-e | {"approach":"real WASD search","forward":4,"right":0,"hint":"E — A first hello","openedBy":"real E"} · [image](en-overlay-first-light-key-e.webp) |
| PASS | en | overlay-first-light-close | {} · [image](en-overlay-first-light-close.webp) |
| PASS | en | zone-workshop-high | {"travel":"QA goTo","zone":"workshop","position":{"x":57.71809768676758,"y":7.152439117431641,"z":-132.1659698486328}} · [image](en-zone-workshop-high.webp) |
| PASS | en | overlay-workshop-key-e | {"approach":"real WASD search","forward":4,"right":0,"hint":"E — Workbench by the stream","openedBy":"real E"} · [image](en-overlay-workshop-key-e.webp) |
| PASS | en | overlay-workshop-close | {} · [image](en-overlay-workshop-close.webp) |
| PASS | en | zone-roots-high | {"travel":"QA goTo","zone":"roots","position":{"x":21.03185272216797,"y":6.819567680358887,"z":-173.35482788085938}} · [image](en-zone-roots-high.webp) |
| PASS | en | overlay-roots-key-e | {"approach":"real WASD search","forward":4,"right":0,"hint":"E — The root stump","openedBy":"real E"} · [image](en-overlay-roots-key-e.webp) |
| PASS | en | overlay-roots-close | {} · [image](en-overlay-roots-close.webp) |
| PASS | en | zone-milestones-high | {"travel":"QA goTo","zone":"milestones","position":{"x":-16.91104507446289,"y":6.553685665130615,"z":-205.79647827148438}} · [image](en-zone-milestones-high.webp) |
| FAIL | en | overlay-milestones-key-e | Error: No content hint after real-key approach at milestones; last hint=. No synthetic content fallback used. · [image](en-overlay-milestones-key-e.webp) |
| PASS | en | overlay-milestones-close | {} · [image](en-overlay-milestones-close.webp) |
| PASS | en | zone-old-trail-high | {"travel":"QA goTo","zone":"old-trail","position":{"x":10.716480255126953,"y":4.6714863777160645,"z":-442.1573486328125}} · [image](en-zone-old-trail-high.webp) |
| PASS | en | overlay-old-trail-key-e | {"approach":"real WASD search","forward":4,"right":3,"hint":"E — Old trail marker","openedBy":"real E"} · [image](en-overlay-old-trail-key-e.webp) |
| PASS | en | overlay-old-trail-close | {} · [image](en-overlay-old-trail-close.webp) |
| PASS | en | zone-horizon-high | {"travel":"QA goTo","zone":"horizon","position":{"x":47.72416687011719,"y":3.041001558303833,"z":-646.13818359375}} · [image](en-zone-horizon-high.webp) |
| PASS | en | overlay-horizon-key-e | {"approach":"real WASD search","forward":4,"right":0,"hint":"E — Sea-facing viewer","openedBy":"real E"} · [image](en-overlay-horizon-key-e.webp) |
| PASS | en | overlay-horizon-close | {} · [image](en-overlay-horizon-close.webp) |
| PASS | en | zone-quiet-shore-high | {"travel":"QA goTo","zone":"quiet-shore","position":{"x":26.75743293762207,"y":1.952019214630127,"z":-778.3305053710938}} · [image](en-zone-quiet-shore-high.webp) |
| FAIL | en | overlay-quiet-shore-key-e | Error: No content hint after real-key approach at quiet-shore; last hint=. No synthetic content fallback used. · [image](en-overlay-quiet-shore-key-e.webp) |
| PASS | en | overlay-quiet-shore-close | {} · [image](en-overlay-quiet-shore-close.webp) |
| PASS | en | zone-last-postcard-high | {"travel":"QA goTo","zone":"last-postcard","position":{"x":7.960856914520264,"y":1.6888712644577026,"z":-895.9990844726562}} · [image](en-zone-last-postcard-high.webp) |
| PASS | en | overlay-last-postcard-key-e | {"approach":"real WASD search","forward":4,"right":3,"hint":"E — The last mailbox","openedBy":"real E"} · [image](en-overlay-last-postcard-key-e.webp) |
| PASS | en | overlay-last-postcard-close | {} · [image](en-overlay-last-postcard-close.webp) |
| PASS | en | journal | {} · [image](en-journal.webp) |
| PASS | en | menu-quality-low | {} · [image](en-menu-quality-low.webp) |
| PASS | en | menu-quality-balanced | {} · [image](en-menu-quality-balanced.webp) |
| PASS | en | menu-quality-high | {} · [image](en-menu-quality-high.webp) |
| PASS | en | menu-reduced-motion | {} · [image](en-menu-reduced-motion.webp) |
| PASS | en | menu-sound | {"audibleSound":"manual review required"} · [image](en-menu-sound.webp) |
| PASS | en | menu-language | {} · [image](en-menu-language.webp) |
| PASS | en | chooser-key-e | {} · [image](en-chooser-key-e.webp) |
| PASS | en | bike-mount | {} · [image](en-bike-mount.webp) |
| PASS | en | bike-manual-movement | {"before":{"x":11.691105842590332,"y":8.187533378601074,"z":-0.9578453898429871},"after":{"x":18.417024612426758,"y":8.102580070495605,"z":-12.546379089355469},"metres":13.398958788024329} · [image](en-bike-manual-movement.webp) |
| PASS | en | bike-cruise | {"before":{"x":18.89899253845215,"y":8.09675121307373,"z":-13.319986343383789},"after":{"x":26.056312561035156,"y":8.007877349853516,"z":-24.336027145385742},"metres":13.136985379341771} · [image](en-bike-cruise.webp) |
| PASS | en | bike-brake | {"drift":0} · [image](en-bike-brake.webp) |
| PASS | en | bike-dismount | {} · [image](en-bike-dismount.webp) |
| PASS | en | secret-page-not-yet | {"method":"QA visitSecret; early page must not trigger ending"} · [image](en-secret-page-not-yet.webp) |
| PASS | en | secret-reflection | {"method":"QA visitSecret","id":"reflection","discoveries":[{"id":"reflection","count":1}]} · [image](en-secret-reflection.webp) |
| PASS | en | secret-forgotten-sound | {"method":"QA visitSecret","id":"forgotten-sound","discoveries":[{"id":"reflection","count":1},{"id":"forgotten-sound","count":2}]} · [image](en-secret-forgotten-sound.webp) |
| PASS | en | secret-unmarked-road | {"method":"QA visitSecret","id":"unmarked-road","discoveries":[{"id":"reflection","count":1},{"id":"forgotten-sound","count":2},{"id":"unmarked-road","count":3}]} · [image](en-secret-unmarked-road.webp) |
| PASS | en | secret-unwritten-page | {"method":"QA visitSecret","id":"unwritten-page","discoveries":[{"id":"reflection","count":1},{"id":"forgotten-sound","count":2},{"id":"unmarked-road","count":3},{"id":"unwritten-page","count":4}]} · [image](en-secret-unwritten-page.webp) |
| PASS | en | ending-full | {} · [image](en-ending-full.webp) |
| PASS | en | railing-real-key-approach | {} · [image](en-railing-real-key-approach.webp) |
| PASS | en | railing-exit | {} · [image](en-railing-exit.webp) |
| PASS | en | exit-world | {} · [image](en-exit-world.webp) |
| PASS | en | desktop-welcome | {} · [image](en-desktop-welcome.webp) |
| PASS | en | desktop-quick | {} · [image](en-desktop-quick.webp) |
| FAIL | en | cv-links | Error: CV PDF link present on Quick  expect(received).toBeGreaterThan(expected)  Expected: > 0 Received:   0 · [image](en-cv-links.webp) |
| PASS | en | case-links-present | {"links":["http://127.0.0.1:4185/en/projects/cms-devops-platform-aws-eks/","http://127.0.0.1:4185/en/projects/partner-data-gateway-azure/","http://127.0.0.1:4185/en/projects/insighthub-rag/","http://127.0.0.1:4185/en/projects/aws-sales-data-pipeline/"]} · [image](en-case-links-present.webp) |
| PASS | en | case-study-1 | {"href":"http://127.0.0.1:4185/en/projects/cms-devops-platform-aws-eks/"} · [image](en-case-study-1.webp) |
| PASS | en | case-study-2 | {"href":"http://127.0.0.1:4185/en/projects/partner-data-gateway-azure/"} · [image](en-case-study-2.webp) |
| PASS | en | case-study-3 | {"href":"http://127.0.0.1:4185/en/projects/insighthub-rag/"} · [image](en-case-study-3.webp) |
| PASS | en | case-study-4 | {"href":"http://127.0.0.1:4185/en/projects/aws-sales-data-pipeline/"} · [image](en-case-study-4.webp) |
| PASS | en | uncaught-errors | {"errors":[]} · [image](en-uncaught-errors.webp) |
| PASS | en | mobile-390-welcome | {} · [image](en-mobile-390-welcome.webp) |
| PASS | en | mobile-390-quick | {} · [image](en-mobile-390-quick.webp) |
| PASS | en | mobile-320-welcome | {} · [image](en-mobile-320-welcome.webp) |
| PASS | en | mobile-320-quick | {} · [image](en-mobile-320-quick.webp) |
