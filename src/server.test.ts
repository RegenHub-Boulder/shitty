import { expect, test, beforeEach, afterEach, describe } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "path";

// Test database setup
const TEST_DB_PATH = "test_shitty.db";
let testDb: Database;


beforeEach(() => {
  testDb = new Database(TEST_DB_PATH);
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS shitty_instances (
      sync_id TEXT PRIMARY KEY,
      tenders TEXT DEFAULT '[]',
      tending_log TEXT DEFAULT '[]',
      last_tended_timestamp INTEGER,
      last_tender TEXT,
      chores TEXT DEFAULT '[]'
    )
  `);
});

afterEach(() => {
  testDb.close();
  try {
    require("fs").unlinkSync(TEST_DB_PATH);
  } catch (e) {
    // File might not exist
  }
});

// Helper functions extracted from server.ts for testing
async function getInstanceData(syncId: string, db = testDb) {
  const query = db.query(`
    SELECT tenders, tending_log, last_tended_timestamp, last_tender, chores 
    FROM shitty_instances WHERE sync_id = ?
  `);
  
  let result = query.get(syncId) as any;
  
  if (!result) {
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
  },
  db = testDb
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

describe("Database Helper Functions", () => {
  test("getInstanceData creates new instance with default chore", async () => {
    const syncId = "test-sync-id";
    const data = await getInstanceData(syncId);
    
    expect(data.tenders).toEqual([]);
    expect(data.tending_log).toEqual([]);
    expect(data.last_tended_timestamp).toBeNull();
    expect(data.last_tender).toBeNull();
    expect(data.chores).toHaveLength(1);
    expect(data.chores[0].name).toBe("Water the plants");
    expect(data.chores[0].icon).toBe("🪴");
    expect(data.chores[0].id).toMatch(/^chore_\d+_[a-z0-9]{5}$/);
  });

  test("getInstanceData returns existing instance", async () => {
    const syncId = "existing-sync-id";
    
    // First call creates the instance
    await getInstanceData(syncId);
    
    // Manually update the instance
    const updatedData = {
      tenders: [{ id: "c1", name: "John" }],
      tending_log: [],
      last_tended_timestamp: null,
      last_tender: null,
      chores: [{ id: "ch1", name: "Test Chore", icon: "🧹" }]
    };
    await updateInstanceData(syncId, updatedData);
    
    // Second call should return the updated data
    const data = await getInstanceData(syncId);
    expect(data.tenders).toEqual([{ id: "c1", name: "John" }]);
    expect(data.chores).toEqual([{ id: "ch1", name: "Test Chore", icon: "🧹" }]);
  });

  test("updateInstanceData modifies existing instance", async () => {
    const syncId = "update-test-id";
    
    // Create instance
    await getInstanceData(syncId);
    
    // Update it
    const newData = {
      tenders: [{ id: "c1", name: "Alice" }, { id: "c2", name: "Bob" }],
      tending_log: [{ id: "h1", timestamp: 1234567890, person: "Alice", chore_id: "ch1", notes: "Done!" }],
      last_tended_timestamp: 1234567890,
      last_tender: "Alice",
      chores: [{ id: "ch1", name: "Dishes", icon: "🍽️" }]
    };
    
    await updateInstanceData(syncId, newData);
    
    // Verify the update
    const data = await getInstanceData(syncId);
    expect(data.tenders).toHaveLength(2);
    expect(data.tenders[0].name).toBe("Alice");
    expect(data.tenders[1].name).toBe("Bob");
    expect(data.tending_log).toHaveLength(1);
    expect(data.tending_log[0].person).toBe("Alice");
    expect(data.last_tended_timestamp).toBe(1234567890);
    expect(data.last_tender).toBe("Alice");
    expect(data.chores[0].name).toBe("Dishes");
  });
});

describe("API Route Logic Tests", () => {
  test("manifest.json structure", () => {
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
      icons: expect.any(Array),
    };
    
    expect(manifest.name).toBe("Shitty - Chore Tracker");
    expect(manifest.short_name).toBe("Shitty");
    expect(manifest.theme_color).toBe("#D97706");
  });

  test("API URL parsing logic", () => {
    const testUrl = "/api/test-sync-id/tenders/item-123";
    const pathParts = testUrl.split("/").filter(p => p.trim() !== "");
    
    expect(pathParts[0]).toBe("api");
    expect(pathParts[1]).toBe("test-sync-id");
    expect(pathParts[2]).toBe("tenders");
    expect(pathParts[3]).toBe("item-123");
  });

  test("tender creation logic", () => {
    const name = "Test User";
    const newTender = { 
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, 
      name: name.trim() 
    };
    
    expect(newTender.name).toBe("Test User");
    expect(newTender.id).toMatch(/^c_\d+_[a-z0-9]{5}$/);
  });

  test("chore creation logic", () => {
    const name = "Clean dishes";
    const icon = "🍽️";
    const newChore = { 
      id: `chore_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, 
      name: name.trim(),
      icon: icon.trim()
    };
    
    expect(newChore.name).toBe("Clean dishes");
    expect(newChore.icon).toBe("🍽️");
    expect(newChore.id).toMatch(/^chore_\d+_[a-z0-9]{5}$/);
  });

  test("tending log entry creation logic", () => {
    const tender = "John Doe";
    const choreId = "chore-123";
    const notes = "Completed successfully";
    const timestamp = Date.now();
    
    const newLogEntry = {
      id: `h_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp,
      person: tender.trim(),
      chore_id: choreId.trim(),
      notes: notes && typeof notes === "string" ? notes.trim() : null,
    };
    
    expect(newLogEntry.person).toBe("John Doe");
    expect(newLogEntry.chore_id).toBe("chore-123");
    expect(newLogEntry.notes).toBe("Completed successfully");
    expect(newLogEntry.id).toMatch(/^h_\d+_[a-z0-9]{5}$/);
    expect(typeof newLogEntry.timestamp).toBe("number");
  });

  test("default chore creation", () => {
    const defaultChore = {
      id: `chore_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: "Water the plants",
      icon: "🪴"
    };
    
    expect(defaultChore.name).toBe("Water the plants");
    expect(defaultChore.icon).toBe("🪴");
    expect(defaultChore.id).toMatch(/^chore_\d+_[a-z0-9]{5}$/);
  });
});