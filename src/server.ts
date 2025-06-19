import { Database } from "bun:sqlite";
import { join } from "path";

const isDev = process.env.NODE_ENV !== "production";
const db = new Database("shitty.db");
const PWA_APP_VERSION = "v1.0.7";
const JSON_HEADERS = { "Content-Type": "application/json" };

function createErrorResponse(message: string, status: number = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: JSON_HEADERS,
  });
}

// Initialize database
await db.exec(`
  CREATE TABLE IF NOT EXISTS shitty_instances (
    sync_id TEXT PRIMARY KEY,
    tenders TEXT DEFAULT '[]',
    tending_log TEXT DEFAULT '[]',
    last_tended_timestamp INTEGER,
    last_tender TEXT,
    chores TEXT DEFAULT '[]'
  )
`);

// Helper functions
async function getInstanceData(syncId: string) {
  const query = db.query(`
    SELECT tenders, tending_log, last_tended_timestamp, last_tender, chores 
    FROM shitty_instances WHERE sync_id = ?
  `);
  
  let result = query.get(syncId) as any;
  
  if (!result) {
    // Create default chore
    const defaultChore = {
      id: `chore_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: "Water the plants",
      icon: "🪴"
    };
    
    const insertQuery = db.query(`
      INSERT INTO shitty_instances (sync_id, tenders, tending_log, last_tended_timestamp, last_tender, chores) 
      VALUES (?, '[]', '[]', NULL, NULL, ?)
    `);
    
    insertQuery.run(syncId, JSON.stringify([defaultChore]));
    result = query.get(syncId);
  }
  
  return {
    tenders: JSON.parse(result.tenders || "[]"),
    tending_log: JSON.parse(result.tending_log || "[]"),
    last_tended_timestamp: result.last_tended_timestamp,
    last_tender: result.last_tender,
    chores: JSON.parse(result.chores || "[]"),
  };
}

async function updateInstanceData(
  syncId: string,
  data: {
    tenders: any[];
    tending_log: any[];
    last_tended_timestamp: number | null;
    last_tender: string | null;
    chores: any[];
  }
) {
  const query = db.query(`
    UPDATE shitty_instances 
    SET tenders = ?, tending_log = ?, last_tended_timestamp = ?, last_tender = ?, chores = ? 
    WHERE sync_id = ?
  `);
  
  query.run(
    JSON.stringify(data.tenders),
    JSON.stringify(data.tending_log),
    data.last_tended_timestamp,
    data.last_tender,
    JSON.stringify(data.chores),
    syncId
  );
}

const server = Bun.serve({
  port: isDev ? 3000 : (process.env.PORT || 3000),
  hostname: process.env.HOST || "0.0.0.0",
  async fetch(req: Request) {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(p => p.trim() !== "");

    // Serve manifest.json
    if (url.pathname === "/manifest.json") {
      const manifest = {
        name: "Shitty - Chore Tracker",
        short_name: "Shitty",
        display: "standalone",
        orientation: "portrait",
        background_color: "#FEF3C7",
        theme_color: "#D97706",
        description: "A simple chore tracker for your household.",
        start_url: "/",
        categories: ["productivity", "utilities"],
        icons: [
          {
            src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
                <rect width="192" height="192" fill="#D97706" rx="24"/>
                <circle cx="96" cy="80" r="35" fill="#8B4513"/>
                <circle cx="96" cy="96" r="30" fill="#A0522D"/>
                <circle cx="96" cy="110" r="25" fill="#CD853F"/>
                <circle cx="85" cy="75" r="3" fill="white"/>
                <circle cx="107" cy="75" r="3" fill="white"/>
                <path d="M85 85 Q96 95 107 85" stroke="white" stroke-width="2" fill="none"/>
              </svg>
            `),
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
          {
            src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
                <rect width="512" height="512" fill="#D97706" rx="64"/>
                <circle cx="256" cy="200" r="90" fill="#8B4513"/>
                <circle cx="256" cy="256" r="80" fill="#A0522D"/>
                <circle cx="256" cy="300" r="65" fill="#CD853F"/>
                <circle cx="230" cy="190" r="8" fill="white"/>
                <circle cx="282" cy="190" r="8" fill="white"/>
                <path d="M230 220 Q256 240 282 220" stroke="white" stroke-width="6" fill="none"/>
              </svg>
            `),
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      };
      return new Response(JSON.stringify(manifest, null, 2), {
        headers: { "Content-Type": "application/manifest+json" },
      });
    }

    // In dev mode, build and serve the client bundle on the fly
    if (isDev && url.pathname === "/client.js") {
      try {
        const result = await Bun.build({
          entrypoints: ["./src/client/main.tsx"],
          target: "browser",
          format: "esm",
          define: {
            "process.env.NODE_ENV": '"development"'
          },
          external: [], // Bundle everything for simplicity
        });

        if (result.outputs.length > 0) {
          const jsCode = await result.outputs[0].text();
          return new Response(jsCode, {
            headers: {
              "Content-Type": "application/javascript",
              "Cache-Control": "no-cache",
            },
          });
        }
      } catch (error) {
        console.error("Build error:", error);
        return new Response(`console.error("Build failed: ${error}");`, {
          headers: { "Content-Type": "application/javascript" },
        });
      }
    }

    // Serve built assets in production
    if (!isDev && url.pathname.startsWith("/dist/")) {
      const filePath = join(process.cwd(), url.pathname.slice(1));
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
    }

    // API Routes
    if (pathParts[0] === "api" && pathParts.length >= 2) {
      const syncId = pathParts[1];
      const apiResource = pathParts.length > 2 ? pathParts[2] : null;
      const itemId = pathParts.length > 3 ? pathParts[3] : null;

      // Tenders API
      if (apiResource === "tenders") {
        let instanceData = await getInstanceData(syncId);
        
        if (req.method === "GET" && !itemId) {
          return new Response(JSON.stringify(instanceData.tenders), {
            headers: JSON_HEADERS,
          });
        } else if (req.method === "POST" && !itemId) {
          const { name } = await req.json();
          if (!name || typeof name !== "string") {
            return createErrorResponse("Invalid name for tender");
          }
          const newTender = { 
            id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, 
            name: name.trim() 
          };
          instanceData.tenders.push(newTender);
          await updateInstanceData(syncId, instanceData);
          return new Response(JSON.stringify(newTender), {
            status: 201,
            headers: JSON_HEADERS,
          });
        } else if (req.method === "PUT" && itemId) {
          const { name } = await req.json();
          if (!name || typeof name !== "string") {
            return createErrorResponse("Invalid new name for tender");
          }
          const tenderIndex = instanceData.tenders.findIndex((c: any) => c.id === itemId);
          if (tenderIndex > -1) {
            instanceData.tenders[tenderIndex].name = name.trim();
            await updateInstanceData(syncId, instanceData);
            return new Response(JSON.stringify(instanceData.tenders[tenderIndex]), {
              headers: JSON_HEADERS,
            });
          }
          return createErrorResponse("Tender not found", 404);
        } else if (req.method === "DELETE" && itemId) {
          const initialLength = instanceData.tenders.length;
          instanceData.tenders = instanceData.tenders.filter((c: any) => c.id !== itemId);
          if (instanceData.tenders.length < initialLength) {
            await updateInstanceData(syncId, instanceData);
            return new Response(null, { status: 204 });
          }
          return createErrorResponse("Tender not found", 404);
        }
      }
      // Chores API
      else if (apiResource === "chores") {
        let instanceData = await getInstanceData(syncId);
        
        if (req.method === "GET" && !itemId) {
          return new Response(JSON.stringify(instanceData.chores), {
            headers: JSON_HEADERS,
          });
        } else if (req.method === "POST" && !itemId) {
          const { name, icon } = await req.json();
          if (!name || typeof name !== "string" || !icon || typeof icon !== "string") {
            return createErrorResponse("Invalid name or icon for chore");
          }
          const newChore = { 
            id: `chore_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, 
            name: name.trim(),
            icon: icon.trim()
          };
          instanceData.chores.push(newChore);
          await updateInstanceData(syncId, instanceData);
          return new Response(JSON.stringify(newChore), {
            status: 201,
            headers: JSON_HEADERS,
          });
        } else if (req.method === "PUT" && itemId) {
          const { name, icon } = await req.json();
          if ((!name || typeof name !== "string") && (!icon || typeof icon !== "string")) {
            return createErrorResponse("Invalid name or icon for chore");
          }
          const choreIndex = instanceData.chores.findIndex((c: any) => c.id === itemId);
          if (choreIndex > -1) {
            if (name) instanceData.chores[choreIndex].name = name.trim();
            if (icon) instanceData.chores[choreIndex].icon = icon.trim();
            await updateInstanceData(syncId, instanceData);
            return new Response(JSON.stringify(instanceData.chores[choreIndex]), {
              headers: JSON_HEADERS,
            });
          }
          return createErrorResponse("Chore not found", 404);
        } else if (req.method === "DELETE" && itemId) {
          const initialLength = instanceData.chores.length;
          instanceData.chores = instanceData.chores.filter((c: any) => c.id !== itemId);
          if (instanceData.chores.length < initialLength) {
            await updateInstanceData(syncId, instanceData);
            return new Response(null, { status: 204 });
          }
          return createErrorResponse("Chore not found", 404);
        }
      }
      // History API
      else if (apiResource === "history") {
        let instanceData = await getInstanceData(syncId);
        
        if (req.method === "GET" && !itemId) {
          const sortedHistory = [...instanceData.tending_log].sort((a, b) => b.timestamp - a.timestamp);
          return new Response(JSON.stringify(sortedHistory), { 
            headers: JSON_HEADERS 
          });
        } else if (req.method === "DELETE" && itemId) {
          const initialLength = instanceData.tending_log.length;
          instanceData.tending_log = instanceData.tending_log.filter((entry: any) => entry.id !== itemId);

          if (instanceData.tending_log.length < initialLength) {
            if (instanceData.tending_log.length > 0) {
              const lastEntry = instanceData.tending_log.reduce((latest: any, entry: any) =>
                entry.timestamp > latest.timestamp ? entry : latest
              );
              instanceData.last_tended_timestamp = lastEntry.timestamp;
              instanceData.last_tender = lastEntry.person;
            } else {
              instanceData.last_tended_timestamp = null;
              instanceData.last_tender = null;
            }
            await updateInstanceData(syncId, instanceData);
            return new Response(null, { status: 204 });
          }
          return createErrorResponse("History entry not found", 404);
        }
      }
      // Tend Action API
      else if (apiResource === "tend" && req.method === "POST") {
        const { tender, choreId, notes } = await req.json();
        if (!tender || typeof tender !== "string" || !choreId || typeof choreId !== "string") {
          return createErrorResponse("Invalid tender or chore identifier");
        }
        const timestamp = Date.now();
        let instanceData = await getInstanceData(syncId);
        const newLogEntry = {
          id: `h_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
          timestamp,
          person: tender.trim(),
          chore_id: choreId.trim(),
          notes: notes && typeof notes === "string" ? notes.trim() : null,
        };
        instanceData.tending_log.push(newLogEntry);
        instanceData.last_tended_timestamp = timestamp;
        instanceData.last_tender = tender.trim();
        await updateInstanceData(syncId, instanceData);
        return new Response(JSON.stringify(newLogEntry), {
          status: 201,
          headers: JSON_HEADERS,
        });
      }
      // Last Tended API
      else if (apiResource === "last-tended" && req.method === "GET") {
        const instanceData = await getInstanceData(syncId);
        return new Response(
          JSON.stringify({
            lastTended: instanceData.last_tended_timestamp,
            lastTender: instanceData.last_tender,
          }),
          {
            headers: JSON_HEADERS,
          }
        );
      }
      // App Version API
      else if (apiResource === "app-version" && req.method === "GET") {
        return new Response(JSON.stringify({ version: PWA_APP_VERSION }), {
          headers: JSON_HEADERS,
        });
      }

      return createErrorResponse("API endpoint not found or method not allowed.", 404);
    }

    // Serve the main HTML page
    const clientScript = isDev 
      ? `<script type="module" src="/client.js"></script>`
      : `<script type="module" src="/dist/main.js"></script>`;

    return new Response(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Shitty - Chore Tracker</title>
  <meta name="description" content="A simple chore tracker for your household.">
  
  <!-- PWA Configuration -->
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#D97706">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="Shitty">
  
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @layer base {
      html, body, #root {
        height: 100%;
        margin: 0;
        padding: 0;
        overflow-x: hidden;
      }
    }

    @layer utilities {
      .shit-float {
        animation: floatingShit 3s ease-in-out infinite;
      }
      
      .shit-float-1 {
        animation: floatingShit 2.8s ease-in-out infinite 0s;
      }
      
      .shit-float-2 {
        animation: floatingShit 3.2s ease-in-out infinite 0.3s;
      }
      
      .shit-float-3 {
        animation: floatingShit 2.9s ease-in-out infinite 0.6s;
      }
      
      .shit-float-4 {
        animation: floatingShit 3.1s ease-in-out infinite 0.9s;
      }
      
      .shit-float-5 {
        animation: floatingShit 2.7s ease-in-out infinite 1.2s;
      }
      
      .shit-float-6 {
        animation: floatingShit 3.3s ease-in-out infinite 1.5s;
      }
      
      @keyframes floatingShit {
        0% { transform: translateY(0px); }
        50% { transform: translateY(-15px); }
        100% { transform: translateY(0px); }
      }
      
      .timeline-entry {
        position: relative;
        z-index: 10;
      }
      
      .timeline-entry:hover {
        transform: translateY(-2px) translateX(2px);
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      }
      
      .timeline-dot {
        z-index: 20;
      }
      
      .timeline-entry:hover .timeline-dot {
        transform: scale(1.2);
        background-color: #d9f99d;
        border-color: #65a30d;
      }
      
      .timeline-entry:hover .timeline-dot-inner {
        background-color: #65a30d;
        transform: scale(1.2);
      }
    }
  </style>
  <script>
    window.PWA_CURRENT_APP_VERSION = "${PWA_APP_VERSION}";
  </script>
</head>
<body>
  <div id="root"></div>
  ${clientScript}
</body>
</html>`,
      {
        headers: {
          "content-type": "text/html",
        },
      }
    );
  }
});

console.log(`🚀 Shitty server running on http://localhost:${server.port} (${isDev ? 'development' : 'production'})`);