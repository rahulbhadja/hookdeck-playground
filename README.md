# Hookdeck Playground

An interactive 3D playground that shows what happens when webhook traffic overwhelms an application, and how Hookdeck can buffer incoming events and pace delivery.

Connect Shopify, Stripe, and WhatsApp, attach an automation, trigger a traffic spike, and watch packages move through the system. Everything runs in the browser with synthetic events. No API keys, backend, or live provider accounts are required.

## Run locally

Use Node.js 22.12+ or Node.js 24, and npm.

```bash
git clone https://github.com/rahulbhadja/hookdeck-playground.git
cd hookdeck-playground
npm ci
npm run dev
```

Open [http://127.0.0.1:5177](http://127.0.0.1:5177). The development server uses port 5177 and binds to localhost.

```bash
npm test          # Run the simulation and interaction-model tests
npm run build    # Type-check and create the production build in dist/
npm run preview  # Preview the production build locally
```

## Explore the playground

The scene starts with **Your app** on its own. You control each step:

1. **Add third-party webhooks** to connect Shopify, Stripe, and WhatsApp.
2. **Add automation** and choose one destination: n8n, Zapier, or Make. Use Undo in the toolbar to go back and choose another.
3. Start **Black Friday**, **Product launch**, or a **Webhook storm**. The surge travels to the receiving computers before they react. Sustained overload after arrival makes them shake and eventually go offline.
4. **Deploy Hookdeck**. The central server rises into view, queues new arrivals, and delivers at a controlled pace to each destination. In this simulation, deployment also restarts stressed or overload-crashed receivers. Already-departed requests finish their original route; deploying does not erase them.
5. Continue experimenting with traffic spikes, maintenance, and protection. Rushes stop after one minute of active play or when you choose **Stop rush**.

Click a provider computer to attach or detach its traffic. Click Your app or the selected automation to take its endpoint offline or restore it. Deliberate maintenance remains under your control. Use the Hookdeck button to turn protection off; clicking the server itself does not remove it.

Routes are selected automatically for the demonstration:

| Source | Destinations |
| --- | --- |
| Shopify | Your app, plus Zapier when selected |
| Stripe | Your app, plus Make when selected |
| WhatsApp | Your app, plus n8n when selected |

Each receiving destination has its own queue, delivery capacity, retries, and counters. These routes are examples, not required integration patterns.

## Watch the rescue

**Watch the rescue** starts an optional 45-second walkthrough: sources connect, an automation appears, a product launch overwhelms the endpoints, and Hookdeck steps in to control delivery.

The status changes from **Rescue in progress** to **Rescue paused** when paused. At the end, **Your turn** appears and the same scene becomes a manual playground. You can pause, restart, exit, or adjust the camera during the walkthrough. Background tabs suspend playback.

## Open a package

Hover a connection to hold the simulation and its packages still, with a one-second release grace so you can reach a box. Counters and overload timers pause with the scene. Click a package, or tap its connection to select the nearest one. That parcel lifts out of the scene, unfolds, and reveals a printed receipt with:

- A provider-specific event, such as an order, payment, or message.
- A sample JSON payload and package ID.
- Explicit **Source** and **Destination** fields, including the actual batch source for outgoing Hookdeck packages.

Each visible parcel retains its sample contents from spawn. Inspection pauses the simulation and preserves its previous pause state. Click outside the package or press **Escape** to close it. The **Open a package** toolbar button also makes inspection available from the keyboard.

## Compare delivery

Choose **Compare the same traffic** from the toolbar, or replay a spike from the event log. Two independent runs receive the same selected traffic pattern: one delivers directly, and the other uses Hookdeck. Switch views to compare delivered, still queued, on-the-way, and failed copies. The comparison preserves your original playground run.

After deploying Hookdeck, the **Protect my … webhooks** action opens setup guidance for your selected automation or application, with links to the relevant documentation and Hookdeck dashboard. It does not create live integrations.

## Controls

| Action | Control |
| --- | --- |
| Orbit the scene | Drag empty space |
| Move the scene | Right-drag, or enable **Pan scene** and drag |
| Zoom | Scroll, pinch, or use the toolbar zoom buttons |
| Fit the computers in view | **Reset camera view** |
| Pause or resume | Toolbar button; Space when the page body has focus |
| Start or stop a traffic spike | Event button; **1** during manual play |
| Toggle app maintenance | Maintenance button; **2** during play |
| Toggle Hookdeck | Hookdeck button; **3** during play |
| Undo the previous setup step | **Undo** in the toolbar |
| Close an inspected package | **Escape** or click outside |
| View delivery history | Click a delivery counter |

Toolbar buttons have hover and keyboard-focus tooltips. The scene follows the system's reduced-motion preference. The playground has no audio.

## Technology and project structure

Built with React, TypeScript, Three.js, React Three Fiber, Drei, and Vite. The scene uses real glTF laptop models, a procedural Hookdeck server, SVG brand marks, instanced packages, and Hookdeck's dark charcoal background (`#141412`).

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Setup flow, controls, labels, counters, and panels |
| `src/Scene.tsx` | Camera, connections, packages, and scene composition |
| `src/ComputerHardware.tsx` | Laptop model, brand displays, and Hookdeck server |
| `src/Architecture.tsx` | Shared 3D geometry and studio reflections |
| `src/BuildingLighting.tsx` | Activity, overload, and recovery lighting |
| `src/simulation.ts` | Fixed-step traffic, in-flight batches, queues, retries, and arrival-based accounting |
| `src/transit.ts` | Shared journey durations and flight records used by the engine and scene |
| `src/town.ts` | Setup stages, providers, selected automation, and walkthrough orchestration |
| `src/traffic.ts` | Named traffic patterns |
| `src/demo.ts` | Rescue timing and story copy |
| `src/comparison.ts` | Independent direct and protected replay engines |
| `src/parcel.ts` | Sample package contents and hover timing |
| `src/PackageOpening.tsx` | Physical package opening animation and printed receipt |
| `src/ExperiencePanels.tsx` | Comparison and integration guidance |
| `src/NavButton.tsx` | Accessible toolbar tooltips |
| `src/styles.css` | Responsive interface |
| `public/` | Locally served models, textures, and SVG logos |

Tests cover traffic patterns, delivery accounting, retry behavior, overload and recovery, walkthrough timing, comparison replay, package identity, hover timing, causal arrival timing, in-flight route changes, and provider detachment.

## What the simulation represents

- Traffic, payloads, capacities, and retry schedules are illustrative. They are not Hookdeck defaults, vendor limits, or performance benchmarks.
- The simulation runs at 2× time using fixed steps. Visual packages represent groups of events, with synthetic sample payloads for inspection; they are not a trace of individual real requests.
- Journeys use three active-play seconds from a provider to the app or Hookdeck, then two seconds from Hookdeck to a destination. These are illustrative animation timings, not real network latency. Queues fill after intake arrival; delivery, failure, and overload are evaluated at the receiving endpoint.
- Hookdeck buffers new arrivals and paces delivery. Previously failed direct deliveries remain in the counters. Turning Hookdeck off bypasses protection for new arrivals and holds its existing queue until re-enabled. Already-dispatched intake and delivery requests finish their journeys. Retry attempts also travel to the endpoint, and failure is decided on arrival.
- The rescue restarts stressed and overload-crashed endpoints as part of the story. A real gateway does not repair application bugs or restart your servers. Planned maintenance stays manual in the playground.
- Direct delivery has no durable input queue in this model. Real providers may retry, so a failed direct attempt here does not prove permanent loss in a real integration.
- Accounting separates delivered, buffered, still travelling from Hookdeck, and failed copies. Provider-to-intake traffic is counted as received only when it arrives.
- A delivery means the destination accepted a webhook, not that an automation finished processing it. A webhook sent to two destinations counts as two delivery copies.
- The simulation does not promise exactly-once processing, ordering, or unlimited retention.

The playground sends no webhook requests to the displayed services. Models, textures, and logos are bundled locally; interface fonts load from Google Fonts.

## Deploy to Vercel

This repository is a static Vite application. Import it into Vercel with these settings:

| Setting | Value |
| --- | --- |
| Root directory | Repository root (`.`) |
| Framework preset | Vite |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |

No environment variables or backend services are needed. Keep the contents of `public/` in the repository so the 3D models and textures are included in the deployment. `node_modules/`, `dist/`, and local environment files are ignored by Git.

## Asset credits

The laptop is [Classic Laptop](https://polyhaven.com/a/classic_laptop) by Arrangemonk / Poly Haven, distributed under [CC0](https://polyhaven.com/license). It is reused with custom screens, brand colors, and material adjustments. The Hookdeck server is original procedural geometry. No Sketchfab models are included. See [computer asset details](public/models/README.md).

Brand SVGs are stored in `public/logos/`. WhatsApp, Zapier, and Make marks were sourced from [Simple Icons](https://simpleicons.org); Hookdeck, Shopify, Stripe, and n8n assets were supplied with the Hookdeck website project. Brand names and marks belong to their respective owners.
