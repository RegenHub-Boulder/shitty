import React, { createContext, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter as Router,
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

// Extend the Window interface for TypeScript
declare global {
  interface Window {
    PWA_CURRENT_APP_VERSION?: string;
  }
}

// PWA Versioning - matches server
const PWA_APP_VERSION = "v1.0.7";

// --- Sync ID Management ---
const LOCAL_STORAGE_SYNC_ID_KEY = "shitty_sync_id_valtown";

function generateNewSyncIdInternal() {
  return `sync_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 9)}`;
}

function getSyncIdFromLocalStorage() {
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(LOCAL_STORAGE_SYNC_ID_KEY);
  }
  return null;
}

function setSyncIdInLocalStorage(syncId: string) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LOCAL_STORAGE_SYNC_ID_KEY, syncId);
  }
}
// --- End Sync ID Management ---

// Context for Sync ID
const SyncIdContext = createContext<string | null>(null);

function useSyncId() {
  return useContext(SyncIdContext);
}

// Main App Component
function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [syncId, setSyncId] = useState<string | null>(null);
  const [isLoadingSyncId, setIsLoadingSyncId] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [currentClientVersion, setCurrentClientVersion] = useState<string | null>(null);
  const refreshingRef = React.useRef(false);

  useEffect(() => {
    // Read the embedded PWA version
    if (typeof window !== "undefined" && window.PWA_CURRENT_APP_VERSION) {
      setCurrentClientVersion(window.PWA_CURRENT_APP_VERSION);
    }

    let currentSyncId = getSyncIdFromLocalStorage();

    if (!currentSyncId) {
      currentSyncId = generateNewSyncIdInternal();
      setSyncIdInLocalStorage(currentSyncId);
    }

    setSyncId(currentSyncId);
    setIsLoadingSyncId(false);

    if (!("serviceWorker" in navigator)) {
      return;
    }

    const swRegistration = navigator.serviceWorker.ready;

    swRegistration.then(registration => {
      if (!registration) return;

      // 1. Initial check for a waiting worker
      if (registration.waiting) {
        setUpdateAvailable(true);
      }

      // 2. Listen for new workers installing
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed") {
            // A new worker has installed. Check if it's now waiting.
            if (registration.waiting) {
              setUpdateAvailable(true);
            }
          }
        });
      });
    });

    // 3. Listen for controller change (new SW has activated)
    const controllerChangeHandler = () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChangeHandler);

    // Cleanup
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChangeHandler);
    };
  }, []);

  const handleUpdate = () => {
    if (!("serviceWorker" in navigator)) {
      window.location.reload();
      return;
    }

    navigator.serviceWorker.ready.then(registration => {
      if (registration && registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      } else {
        window.location.reload();
      }
    });
  };

  if (isLoadingSyncId || !syncId) {
    return (
      <div className="flex flex-col min-h-screen bg-gradient-to-br from-amber-100 via-yellow-50 to-orange-100 items-center justify-center text-2xl">
        {"Initializing Shitty instance..."}
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </div>
    );
  }

  return (
    <SyncIdContext.Provider value={syncId}>
      <div className="flex flex-col min-h-screen bg-gradient-to-br from-amber-100 via-yellow-50 to-orange-100">
        <header className="bg-gradient-to-r from-amber-200 to-yellow-200 p-4 shadow-md">
          <Link to="/" className="text-3xl font-bold text-amber-800 hover:text-amber-900">💩 Shitty</Link>
          <nav>
            <Link to={`/history`} className="mr-4 text-xl text-amber-700 hover:text-amber-900">History</Link>
            <Link to={`/settings`} className="text-xl text-amber-700 hover:text-amber-900">Settings</Link>
          </nav>
        </header>
        <main className="flex-grow flex items-center justify-center">
          <Routes>
            <Route path={`/`} element={<ShitView />} />
            <Route path={`/history`} element={<HistoryView />} />
            <Route
              path={`/settings`}
              element={
                <SyncSettingsView
                  updateAvailable={updateAvailable}
                  onUpdate={handleUpdate}
                  currentClientVersion={currentClientVersion}
                />
              }
            />
            <Route path="*" element={<ShitView />} />
          </Routes>
        </main>
        <footer className="bg-gradient-to-r from-amber-200 to-yellow-200 p-4 text-center text-amber-700">
          <a href="https://www.val.town/x/jonbo/planty" target="_top" className="text-xl hover:text-amber-900">
            made with ❤️ at RegenHub
          </a>
        </footer>
      </div>
    </SyncIdContext.Provider>
  );
}

// Wrapped App with Router
function RoutedApp() {
  return (
    <Router>
      <App />
    </Router>
  );
}

function ShitView() {
  const syncId = useSyncId();
  const [chores, setChores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  async function fetchChoresInternal() {
    if (!syncId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/${syncId}/chores`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setChores(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching chores:", error);
      setChores([]);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    fetchChoresInternal();
  }, [syncId]);

  if (!syncId) return <div>Loading sync information...</div>;
  if (isLoading) return <div className="h-full flex items-center justify-center text-2xl text-amber-700">Loading chores...</div>;

  // Calculate layout based on number of chores
  const choreCount = chores.length;
  let containerClass = "h-full flex items-center justify-center";
  
  if (choreCount === 0) {
    return (
      <div className={containerClass}>
        <div className="text-center text-amber-700">
          <p className="text-2xl mb-4">No chores configured</p>
          <p>Add chores in Settings</p>
        </div>
      </div>
    );
  } else {
    // Single row layout for 1-6 chores
    return (
      <div className={containerClass}>
        <div className="flex gap-4 items-start justify-center flex-wrap">
          {chores.slice(0, 6).map((chore, index) => (
            <ShitPile key={chore.id} chore={chore} onTended={fetchChoresInternal} animationIndex={index} />
          ))}
        </div>
      </div>
    );
  }
}

function ShitPile({ chore, onTended, animationIndex = 0 }: { chore: any; onTended: () => void; animationIndex?: number }) {
  const syncId = useSyncId();
  const [lastTended, setLastTended] = useState(null);
  const [lastCareTaker, setLastCareTaker] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  async function fetchLastTendedInternal() {
    if (!syncId || !chore) return;
    setIsLoading(true);
    try {
      // Fetch the history and find the last tending for this specific chore
      const response = await fetch(`/api/${syncId}/history`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const allHistory = await response.json();
      
      // Filter for this chore and get the most recent
      const choreHistory = allHistory.filter((entry: any) => entry.chore_id === chore.id);
      if (choreHistory.length > 0) {
        const lastEntry = choreHistory[0]; // Already sorted by timestamp desc from API
        setLastTended(lastEntry.timestamp);
        setLastCareTaker(lastEntry.person);
      } else {
        setLastTended(null);
        setLastCareTaker(null);
      }
    } catch (error) {
      console.error("Error fetching last tended:", error);
      setLastTended(null);
      setLastCareTaker(null);
    }
    setIsLoading(false);
  }

  // Initial data fetch when component mounts or syncId/chore changes
  useEffect(() => {
    fetchLastTendedInternal();
  }, [syncId, chore]);

  // Set up refresh timer - every 5 minutes
  useEffect(() => {
    // Only refresh the time display, not refetch data
    const displayRefreshInterval = setInterval(() => {
      setRefreshKey(prev => prev + 1); // Trigger re-render without visual effects
    }, 60 * 1000); // Update display every minute for smoother time transitions

    // Fetch fresh data every 5 minutes
    const dataRefreshInterval = setInterval(() => {
      fetchLastTendedInternal();
    }, 5 * 60 * 1000);

    // Clean up intervals on unmount
    return () => {
      clearInterval(displayRefreshInterval);
      clearInterval(dataRefreshInterval);
    };
  }, [syncId, chore]); // Re-create intervals if syncId or chore changes

  function getTimeSinceLastTending() {
    if (lastTended === null || typeof lastTended === "undefined") return "no tending logged";

    const now = Date.now();
    const diff = now - Number(lastTended); // Ensure lastTended is a number
    if (isNaN(diff)) return "Loading..."; // Or handle error

    if (diff < 0) return "Just now (check clock?)"; // Future date

    // Calculate hours and days
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    // Show hours if less than 24 hours ago
    if (hours < 24) {
      if (hours === 0) return "less than an hour ago";
      if (hours === 1) return "1 hour ago";
      return `${hours} hours ago`;
    }

    // Show days for 1+ days
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  }

  function getTextColorClass() {
    if (lastTended === null || typeof lastTended === "undefined") return "text-amber-600";
    const days = Math.floor((Date.now() - Number(lastTended)) / (1000 * 60 * 60 * 24));

    // Calculate opacity percentage based on days (30% to 100% over 4 days)
    const opacityPercent = Math.min(30 + (70 * days / 4), 100);

    // Convert opacity percentage to Tailwind opacity class (30, 40, 50, 60, 70, 80, 90, 100)
    const opacityClass = `opacity-${Math.ceil(opacityPercent / 10) * 10}`;

    return `text-amber-800 ${opacityClass}`;
  }

  function getAnimationClass() {
    // Cycle through the available animation classes
    const animationClasses = ['shit-float-1', 'shit-float-2', 'shit-float-3', 'shit-float-4', 'shit-float-5', 'shit-float-6'];
    return animationClasses[animationIndex % animationClasses.length];
  }

  return (
    <div className="text-center flex flex-col items-center w-48">
      {isLoading
        ? (
          <div className="text-2xl text-amber-700">
            Assembling bits
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </div>
        )
        : (
          <>
            <div
              className={`text-9xl cursor-pointer mb-4 ${getAnimationClass()} relative z-10 h-28 flex items-center justify-center`}
              onClick={() => setShowModal(true)}
            >
              {chore.icon}
            </div>
            <h3 className="text-2xl font-semibold text-amber-800 mb-2 h-16 flex items-center justify-center leading-tight">{chore.name}</h3>
            {/* Using refreshKey to trigger re-renders without affecting the DOM structure */}
            <div key={refreshKey} className={`text-lg ${getTextColorClass()} leading-tight`}>
              {lastTended === null || typeof lastTended === "undefined" 
                ? "no tending logged"
                : `Last tended ${getTimeSinceLastTending()}${lastCareTaker ? ` by ${lastCareTaker}` : ""}`
              }
            </div>
          </>
        )}
      {showModal && (
        <CareTakerSelectionModal
          chore={chore}
          onClose={() => setShowModal(false)}
          onTended={() => {
            fetchLastTendedInternal();
            if (onTended) onTended(); // Also call parent's onTended to refresh chores if needed
          }}
        />
      )}
    </div>
  );
}

function CareTakerSelectionModal({ chore, onClose, onTended }: { chore: any; onClose: () => void; onTended: () => void }) {
  const syncId = useSyncId();
  const [careTakers, setCareTakers] = useState([]);
  const [recentCareTakers, setRecentCareTakers] = useState([]);
  const [newCareTakerName, setNewCareTakerName] = useState("");
  const [notes, setNotes] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [selectedCareTaker, setSelectedCareTaker] = useState(null);
  const [sortedCareTakers, setSortedCareTakers] = useState([]);

  async function fetchCareTakersInternal() {
    if (!syncId) return;
    try {
      const response = await fetch(`/api/${syncId}/caretakers`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setCareTakers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching caretakers:", error);
      setCareTakers([]);
    }
  }

  async function fetchRecentCareTakersInternal() {
    if (!syncId) return;
    try {
      const response = await fetch(`/api/${syncId}/history`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      // Extract unique caretaker names from recent history
      const uniqueNames = Array.isArray(data)
        ? [...new Set(data.slice(0, 10).map((entry: any) => entry.person))]
        : [];

      setRecentCareTakers(uniqueNames);
    } catch (error) {
      console.error("Error fetching recent caretakers:", error);
      setRecentCareTakers([]);
    }
  }

  // Create a sorted caretaker list with recent caretakers first
  useEffect(() => {
    if (careTakers.length === 0) return;

    // Create a map of recently used caretakers for faster lookups
    const recentMap = new Map();
    recentCareTakers.forEach((name, index) => {
      recentMap.set(name, index);
    });

    // Sort caretakers: recent ones first (in order of recency), then others alphabetically
    const sorted = [...careTakers].sort((a: any, b: any) => {
      const aIsRecent = recentMap.has(a.name);
      const bIsRecent = recentMap.has(b.name);

      if (aIsRecent && bIsRecent) {
        // Both are recent, sort by recency (lower index = more recent)
        return recentMap.get(a.name) - recentMap.get(b.name);
      } else if (aIsRecent) {
        // Only a is recent, it comes first
        return -1;
      } else if (bIsRecent) {
        // Only b is recent, it comes first
        return 1;
      } else {
        // Neither is recent, sort alphabetically
        return a.name.localeCompare(b.name);
      }
    });

    setSortedCareTakers(sorted);
  }, [careTakers, recentCareTakers]);

  useEffect(() => {
    fetchCareTakersInternal();
    fetchRecentCareTakersInternal();
  }, [syncId]);

  async function handleTending() {
    const careTakerName = selectedCareTaker || newCareTakerName.trim();
    if (!syncId || !careTakerName) return;

    try {
      await fetch(`/api/${syncId}/tend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caretaker: careTakerName,
          choreId: chore.id,
          notes: notes.trim() || null,
        }),
      });

      if (newCareTakerName.trim() && !selectedCareTaker) {
        // Add the new caretaker to the list
        await fetch(`/api/${syncId}/caretakers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newCareTakerName.trim() }),
        });
      }

      onTended(); // This will call fetchLastTendedInternal in ShitPile component
      onClose();
    } catch (error) {
      console.error("Error tending space:", error);
    }
  }

  function selectCareTaker(name: string) {
    setSelectedCareTaker(name);
    setNewCareTakerName(""); // Clear the input field when selecting a caretaker
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg p-6 w-full max-w-md border-2 border-amber-200 shadow-xl relative z-50">
        <h2 className="text-2xl mb-4 text-amber-800 font-bold">Who's logging {chore.name}?</h2>


        {/* Unified caretakers list */}
        <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
          {sortedCareTakers.map((careTaker: any) => (
            <button
              key={careTaker.id}
              className={`w-full py-2 px-3 rounded text-left ${
                selectedCareTaker === careTaker.name
                  ? "bg-amber-500 text-white"
                  : "bg-amber-100 hover:bg-amber-200 text-amber-800"
              } ${recentCareTakers.includes(careTaker.name) ? "border-l-4 border-amber-400" : ""}`}
              onClick={() => selectCareTaker(careTaker.name)}
            >
              {careTaker.name}
              {recentCareTakers.includes(careTaker.name)
                && <span className="text-xs ml-2 opacity-70"></span>}
            </button>
          ))}

          {/* New caretaker input styled like an option */}
          <div
            className={`w-full py-2 px-3 rounded ${
              !selectedCareTaker && newCareTakerName
                ? "bg-amber-500 text-white"
                : "bg-yellow-50 border border-dashed border-amber-300"
            }`}
          >
            <input
              type="text"
              value={newCareTakerName}
              onChange={(e) => {
                setNewCareTakerName(e.target.value);
                setSelectedCareTaker(null); // Clear selection when typing
              }}
              placeholder="+ Add new tender"
              className={`w-full bg-transparent focus:outline-none ${
                !selectedCareTaker && newCareTakerName
                  ? "text-white placeholder-amber-100"
                  : "text-amber-800 placeholder-amber-400"
              }`}
              disabled={isAdding}
            />
          </div>
        </div>

        {/* Notes section */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-amber-700 mb-1">
            Any notes about the tending?
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-amber-300 rounded px-2 py-1 focus:ring-amber-500 focus:border-amber-500 min-h-[80px] bg-yellow-50"
            placeholder="What did you clean? Any issues found? How shitty was it? Everything is welcome."
          />
        </div>

        {/* Action buttons */}
        <button
          onClick={handleTending}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded mb-2 disabled:opacity-50 font-semibold"
          disabled={isAdding || (!selectedCareTaker && !newCareTakerName.trim())}
        >
          Log Tending {chore.icon}
        </button>

        <button
          onClick={onClose}
          className="w-full bg-amber-200 hover:bg-amber-300 text-amber-800 py-2 rounded"
          disabled={isAdding}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function HistoryView() {
  const syncId = useSyncId();
  if (!syncId) return <div>Loading sync information...</div>;
  return (
    <div className="w-full max-w-2xl mx-auto">
      <ShitHistoryComponent />
    </div>
  );
}

function ShitHistoryComponent() {
  const syncId = useSyncId();
  const [careTakers, setCareTakers] = useState([]);
  const [chores, setChores] = useState([]);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showExactTimes, setShowExactTimes] = useState({});
  const [clickedTimestamp, setClickedTimestamp] = useState(null);

  // Helper function to format relative time
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSecs < 60) return "just now";
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? "minute" : "minutes"} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
    if (diffDays < 30) return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
    if (diffMonths < 12) return `${diffMonths} ${diffMonths === 1 ? "month" : "months"} ago`;
    return `${diffYears} ${diffYears === 1 ? "year" : "years"} ago`;
  };

  // Toggle visibility of exact timestamp for an entry
  const toggleExactTime = (entryId: string) => {
    setClickedTimestamp(entryId);
    setTimeout(() => setClickedTimestamp(null), 500);

    setShowExactTimes(prev => ({
      ...prev,
      [entryId]: !prev[entryId],
    }));
  };

  // Get chore by ID
  const getChoreById = (choreId: string) => {
    return chores.find((chore: any) => chore.id === choreId);
  };

  async function fetchDataInternal() {
    if (!syncId) return;
    setIsLoading(true);
    setIsProcessing(true);
    try {
      const [careTakersResponse, choresResponse, historyResponse] = await Promise.all([
        fetch(`/api/${syncId}/caretakers`),
        fetch(`/api/${syncId}/chores`),
        fetch(`/api/${syncId}/history`),
      ]);
      if (!careTakersResponse.ok) throw new Error(`CareTakers fetch error! status: ${careTakersResponse.status}`);
      if (!choresResponse.ok) throw new Error(`Chores fetch error! status: ${choresResponse.status}`);
      if (!historyResponse.ok) throw new Error(`History fetch error! status: ${historyResponse.status}`);

      const careTakersData = await careTakersResponse.json();
      const choresData = await choresResponse.json();
      const historyData = await historyResponse.json();

      setCareTakers(Array.isArray(careTakersData) ? careTakersData : []);
      setChores(Array.isArray(choresData) ? choresData : []);
      setHistory(Array.isArray(historyData) ? historyData : []);
    } catch (error) {
      console.error("Error fetching data for history:", error);
      setCareTakers([]);
      setChores([]);
      setHistory([]);
    }
    setIsLoading(false);
    setIsProcessing(false);
  }

  useEffect(() => {
    fetchDataInternal();
  }, [syncId]);

  async function handleDeleteHistoryEntry(entryId: string) {
    if (!syncId || !entryId) return;
    if (!confirm("Are you sure you want to delete this history entry? This cannot be undone.")) return;
    setIsProcessing(true);
    try {
      await fetch(`/api/${syncId}/history/${entryId}`, { method: "DELETE" });
      fetchDataInternal(); // Refresh
    } catch (error) {
      console.error("Error deleting history entry:", error);
    } finally {
      setIsProcessing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="text-2xl text-amber-700">
        Loading history data...
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </div>
    );
  }

  return (
    <div className={`${isProcessing ? "opacity-50 pointer-events-none" : ""}`}>
      <section className="p-6 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg shadow-lg max-w-md mx-auto border-2 border-amber-200">
        <h3 className="text-xl mb-5 font-semibold text-amber-700">📜 Tending History</h3>
        {history.length === 0
          ? <p className="text-amber-600">No tending history yet for this Shitty instance.</p>
          : (
            <div className="relative pl-8">
              {/* Timeline vine */}
              <div
                className="absolute left-4 top-2 h-full w-0.5"
                style={{
                  backgroundImage: "linear-gradient(to bottom, #d97706 0%, #92400e 100%)",
                  boxShadow: "0 0 8px rgba(217, 119, 6, 0.5)",
                }}
              >
              </div>

              <ul className="space-y-10">
                {history.map((entry: any) => (
                  <li key={entry.id} className="relative timeline-entry">
                    {/* Timeline dot */}
                    <div className="absolute -left-8 top-0 h-5 w-5 rounded-full bg-amber-100 border-2 border-amber-500 flex items-center justify-center timeline-dot">
                      <div className="h-2 w-2 rounded-full bg-amber-600 timeline-dot-inner"></div>
                    </div>

                    <div className="bg-amber-50 p-4 rounded-lg shadow-sm border border-amber-200">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-amber-800 text-lg tracking-wide">{entry.person}</span>
                          {(() => {
                            const chore = getChoreById(entry.chore_id);
                            return chore ? (
                              <span className="text-sm bg-amber-200 px-2 py-0.5 rounded flex items-center gap-1">
                                <span>{chore.icon}</span>
                                <span>{chore.name}</span>
                              </span>
                            ) : null;
                          })()}
                        </div>

                        {/* Clickable timestamp */}
                        <button
                          onClick={() => toggleExactTime(entry.id)}
                          className={`text-left text-sm text-amber-600 hover:text-amber-800 mt-1 transition-colors duration-200`}
                        >
                          {showExactTimes[entry.id]
                            ? new Date(entry.timestamp).toLocaleString()
                            : formatRelativeTime(entry.timestamp)}
                        </button>

                        {/* Display notes if they exist */}
                        {entry.notes && (
                          <div className="mt-2 p-2 bg-yellow-100 rounded text-sm text-amber-800 border border-yellow-200">
                            <div className="font-medium mb-1">Notes:</div>
                            <p className="whitespace-pre-wrap">{entry.notes}</p>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => handleDeleteHistoryEntry(entry.id)}
                          className="text-sm text-red-400 hover:text-red-600 transition-colors duration-200"
                          disabled={isProcessing}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
      </section>
    </div>
  );
}

// --- SYNC SETTINGS COMPONENTS ---

function SyncSettingsView({ updateAvailable, onUpdate, currentClientVersion }: {
  updateAvailable: boolean;
  onUpdate: () => void;
  currentClientVersion: string | null;
}) {
  const syncId = useSyncId();
  if (!syncId) return <div>Loading sync information...</div>;
  return (
    <div className="space-y-6 w-full max-w-lg p-4">
      {/* Updates Section */}
      <UpdatesComponent
        updateAvailable={updateAvailable}
        onUpdate={onUpdate}
        currentClientVersion={currentClientVersion}
      />

      {/* Chores Management Section */}
      <ManageChoresComponent />

      {/* CareTakers Management Section */}
      <ManageCareTakersComponent />

      {/* Sync Settings */}
      <SyncSettingsComponent currentSyncId={syncId} />
    </div>
  );
}

function UpdatesComponent({ updateAvailable, onUpdate, currentClientVersion }: {
  updateAvailable: boolean;
  onUpdate: () => void;
  currentClientVersion: string | null;
}) {
  const [latestServerVersion, setLatestServerVersion] = useState<string | null>(null);
  const [isLoadingLatestVersion, setIsLoadingLatestVersion] = useState(false);

  useEffect(() => {
    if (updateAvailable) {
      setIsLoadingLatestVersion(true);
      fetch("/api/app-version") // Assuming syncId is not needed for this global app version
        .then(res => {
          if (!res.ok) throw new Error("Failed to fetch latest version");
          return res.json();
        })
        .then(data => {
          setLatestServerVersion(data.version);
        })
        .catch(error => {
          console.error("Error fetching latest app version:", error);
          setLatestServerVersion(null); // Clear or set error state
        })
        .finally(() => {
          setIsLoadingLatestVersion(false);
        });
    }
  }, [updateAvailable]);

  return (
    <section className="p-4 bg-white rounded-lg shadow">
      <h3 className="text-xl mb-3 font-semibold text-amber-700">App Updates</h3>

      {updateAvailable
        ? (
          <div className="bg-amber-100 p-4 rounded-md border border-amber-300">
            <div className="flex flex-col">
              <div className="flex items-center mb-2">
                <div className="text-amber-800 flex-grow">
                  <p className="font-medium">A new version is available!</p>
                  {currentClientVersion && <p className="text-sm mt-1">Current version: {currentClientVersion}</p>}
                  {isLoadingLatestVersion && <p className="text-sm mt-1">Checking for latest version...</p>}
                  {latestServerVersion && !isLoadingLatestVersion && (
                    <p className="text-sm mt-1">New version: {latestServerVersion}</p>
                  )}
                </div>
                <button
                  onClick={onUpdate}
                  className="bg-amber-600 text-white px-4 py-2 rounded-md text-sm hover:bg-amber-700 transition-colors duration-150 ml-4"
                >
                  Update Now
                </button>
              </div>
              {latestServerVersion && currentClientVersion && latestServerVersion === currentClientVersion
                && !isLoadingLatestVersion && (
                <p className="text-xs text-amber-600 mt-1">
                  You appear to have the latest code, but a service worker update is pending. Clicking update will
                  refresh.
                </p>
              )}
            </div>
          </div>
        )
        : (
          <div className="bg-green-50 p-4 rounded-md border border-green-200">
            <div className="flex items-center">
              <div className="text-green-800">
                <p className="font-medium">You're using the latest version</p>
                {currentClientVersion && <p className="text-sm mt-1">Version: {currentClientVersion}</p>}
                {!currentClientVersion && <p className="text-sm mt-1">Shitty is up to date!</p>}
              </div>
              <svg
                className="h-5 w-5 text-green-600 ml-auto"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        )}
    </section>
  );
}

function ManageChoresComponent() {
  const syncId = useSyncId();
  const [chores, setChores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newChoreName, setNewChoreName] = useState("");
  const [newChoreIcon, setNewChoreIcon] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  async function fetchChoresInternal() {
    if (!syncId) return;
    setIsLoading(true);
    setIsProcessing(true);
    try {
      const choresResponse = await fetch(`/api/${syncId}/chores`);
      if (!choresResponse.ok) throw new Error(`Chores fetch error! status: ${choresResponse.status}`);

      const choresData = await choresResponse.json();
      setChores(Array.isArray(choresData) ? choresData : []);
    } catch (error) {
      console.error("Error fetching chores:", error);
      setChores([]);
    }
    setIsLoading(false);
    setIsProcessing(false);
  }

  useEffect(() => {
    fetchChoresInternal();
  }, [syncId]);

  async function handleAddChore() {
    if (!syncId || !newChoreName.trim() || !newChoreIcon.trim()) return;
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/${syncId}/chores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newChoreName.trim(), icon: newChoreIcon.trim() }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      setNewChoreName("");
      setNewChoreIcon("");
      fetchChoresInternal(); // Refresh chores
    } catch (error) {
      console.error("Error adding chore:", error);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleRenameChore(choreId: string, currentName: string, currentIcon: string) {
    if (!syncId || !choreId) return;
    const newName = prompt("Enter new name for " + currentName + ":", currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      setIsProcessing(true);
      try {
        await fetch(`/api/${syncId}/chores/${choreId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName.trim(), icon: currentIcon }),
        });
        fetchChoresInternal(); // Refresh
      } catch (error) {
        console.error("Error renaming chore:", error);
      } finally {
        setIsProcessing(false);
      }
    }
  }

  async function handleChangeIcon(choreId: string, currentName: string, currentIcon: string) {
    if (!syncId || !choreId) return;
    const newIcon = prompt("Enter new icon for " + currentName + ":", currentIcon);
    if (newIcon && newIcon.trim() && newIcon.trim() !== currentIcon) {
      setIsProcessing(true);
      try {
        await fetch(`/api/${syncId}/chores/${choreId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: currentName, icon: newIcon.trim() }),
        });
        fetchChoresInternal(); // Refresh
      } catch (error) {
        console.error("Error changing chore icon:", error);
      } finally {
        setIsProcessing(false);
      }
    }
  }

  async function handleDeleteChore(choreId: string, choreName: string) {
    if (!syncId || !choreId) return;
    if (!confirm(`Are you sure you want to delete the chore "${choreName}"? This will also delete all tending history for this chore.`)) return;
    setIsProcessing(true);
    try {
      await fetch(`/api/${syncId}/chores/${choreId}`, { method: "DELETE" });
      fetchChoresInternal(); // Refresh
    } catch (error) {
      console.error("Error deleting chore:", error);
    } finally {
      setIsProcessing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="text-2xl mt-6 text-amber-700">
        Loading chores...
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </div>
    );
  }

  return (
    <div className={`mt-6 ${isProcessing ? "opacity-50 pointer-events-none" : ""}`}>
      <section className="p-4 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg shadow-lg border-2 border-amber-200">
        <h3 className="text-xl mb-3 font-semibold text-amber-700">🎯 Manage Chores</h3>
        {chores.length === 0 && !isLoading
          ? <p className="text-amber-600">No chores added yet.</p>
          : null}
        <ul className="space-y-2">
          {chores.map((chore: any) => (
            <li
              key={chore.id}
              className="flex items-center justify-between p-2 bg-amber-50 rounded border border-amber-200"
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{chore.icon}</span>
                <span className="text-amber-800">{chore.name}</span>
              </div>
              <div className="space-x-2">
                <button
                  onClick={() => handleChangeIcon(chore.id, chore.name, chore.icon)}
                  className="text-sm text-blue-500 hover:text-blue-700"
                  disabled={isProcessing}
                >
                  🎨 Icon
                </button>
                <button
                  onClick={() => handleRenameChore(chore.id, chore.name, chore.icon)}
                  className="text-sm text-blue-500 hover:text-blue-700"
                  disabled={isProcessing}
                >
                  ✏️ Rename
                </button>
                <button
                  onClick={() => handleDeleteChore(chore.id, chore.name)}
                  className="text-sm text-red-500 hover:text-red-700"
                  disabled={isProcessing}
                >
                  ❌ Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 mt-4">
          <input
            type="text"
            value={newChoreIcon}
            onChange={(e) => setNewChoreIcon(e.target.value)}
            placeholder="Icon"
            className="w-20 border border-amber-300 rounded px-2 py-1 focus:ring-amber-500 focus:border-amber-500 bg-yellow-50 text-center text-2xl"
            disabled={isProcessing}
            maxLength={2}
          />
          <input
            type="text"
            value={newChoreName}
            onChange={(e) => setNewChoreName(e.target.value)}
            placeholder="New chore name"
            className="flex-grow border border-amber-300 rounded px-2 py-1 focus:ring-amber-500 focus:border-amber-500 bg-yellow-50"
            disabled={isProcessing}
          />
          <button
            onClick={handleAddChore}
            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-1 rounded disabled:opacity-50 font-semibold"
            disabled={isProcessing || !newChoreName.trim() || !newChoreIcon.trim()}
          >
            {isProcessing ? "Adding..." : "Add Chore"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ManageCareTakersComponent() {
  const syncId = useSyncId();
  const [careTakers, setCareTakers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newCareTakerName, setNewCareTakerName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  async function fetchCareTakersInternal() {
    if (!syncId) return;
    setIsLoading(true);
    setIsProcessing(true);
    try {
      const careTakersResponse = await fetch(`/api/${syncId}/caretakers`);
      if (!careTakersResponse.ok) throw new Error(`CareTakers fetch error! status: ${careTakersResponse.status}`);

      const careTakersData = await careTakersResponse.json();
      setCareTakers(Array.isArray(careTakersData) ? careTakersData : []);
    } catch (error) {
      console.error("Error fetching caretakers:", error);
      setCareTakers([]);
    }
    setIsLoading(false);
    setIsProcessing(false);
  }

  useEffect(() => {
    fetchCareTakersInternal();
  }, [syncId]);

  async function handleAddCareTaker() {
    if (!syncId || !newCareTakerName.trim()) return;
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/${syncId}/caretakers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCareTakerName.trim() }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      setNewCareTakerName("");
      fetchCareTakersInternal(); // Refresh caretakers
    } catch (error) {
      console.error("Error adding caretaker:", error);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleRenameCareTaker(careTakerId: string, currentName: string) {
    if (!syncId || !careTakerId) return;
    const newName = prompt("Enter new name for " + currentName + ":", currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      setIsProcessing(true);
      try {
        await fetch(`/api/${syncId}/caretakers/${careTakerId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName.trim() }),
        });
        fetchCareTakersInternal(); // Refresh
      } catch (error) {
        console.error("Error renaming caretaker:", error);
      } finally {
        setIsProcessing(false);
      }
    }
  }

  async function handleDeleteCareTaker(careTakerId: string, careTakerName: string) {
    if (!syncId || !careTakerId) return;
    if (!confirm(`Are you sure you want to delete caretaker "${careTakerName}"? This cannot be undone.`)) return;
    setIsProcessing(true);
    try {
      await fetch(`/api/${syncId}/caretakers/${careTakerId}`, { method: "DELETE" });
      fetchCareTakersInternal(); // Refresh
    } catch (error) {
      console.error("Error deleting caretaker:", error);
    } finally {
      setIsProcessing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="text-2xl mt-6 text-amber-700">
        Loading caretakers...
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </div>
    );
  }

  return (
    <div className={`mt-6 ${isProcessing ? "opacity-50 pointer-events-none" : ""}`}>
      <section className="p-4 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg shadow-lg border-2 border-amber-200">
        <h3 className="text-xl mb-3 font-semibold text-amber-700">👥 Manage Caretakers</h3>
        {careTakers.length === 0 && !isLoading
          ? <p className="text-amber-600">No caretakers added yet.</p>
          : null}
        <ul className="space-y-2">
          {careTakers.map((careTaker: any) => (
            <li
              key={careTaker.id}
              className="flex items-center justify-between p-2 bg-amber-50 rounded border border-amber-200"
            >
              <span className="text-amber-800">{careTaker.name}</span>
              <div className="space-x-2">
                <button
                  onClick={() => handleRenameCareTaker(careTaker.id, careTaker.name)}
                  className="text-sm text-blue-500 hover:text-blue-700"
                  disabled={isProcessing}
                >
                  ✏️ Rename
                </button>
                <button
                  onClick={() => handleDeleteCareTaker(careTaker.id, careTaker.name)}
                  className="text-sm text-red-500 hover:text-red-700"
                  disabled={isProcessing}
                >
                  ❌ Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex mt-4">
          <input
            type="text"
            value={newCareTakerName}
            onChange={(e) => setNewCareTakerName(e.target.value)}
            placeholder="New caretaker name"
            className="flex-grow border border-amber-300 rounded-l px-2 py-1 focus:ring-amber-500 focus:border-amber-500 bg-yellow-50"
            disabled={isProcessing}
          />
          <button
            onClick={handleAddCareTaker}
            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-1 rounded-r disabled:opacity-50 font-semibold"
            disabled={isProcessing || !newCareTakerName.trim()}
          >
            {isProcessing ? "Adding..." : "Add Caretaker"}
          </button>
        </div>
      </section>
    </div>
  );
}

function SyncSettingsComponent({ currentSyncId }: { currentSyncId: string }) {
  const [newCodeInput, setNewCodeInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentSyncId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyNewCode = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmedCode = newCodeInput.trim();

    if (!trimmedCode) {
      setError("Sync code cannot be empty.");
      return;
    }
    if (trimmedCode.length < 6) {
      setError("Sync code should be at least 6 characters long.");
      return;
    }
    if (trimmedCode === currentSyncId) {
      setError("This is already your current sync code.");
      return;
    }

    setIsApplying(true);
    setSyncIdInLocalStorage(trimmedCode);

    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const handleGenerateNew = () => {
    if (
      window.confirm(
        "Generating a new code will create a new sync instance. Your current data will remain but will no longer be associated with this view until you re-enter the old code. Continue?",
      )
    ) {
      setIsApplying(true);
      const newGeneratedSyncId = generateNewSyncIdInternal();
      setSyncIdInLocalStorage(newGeneratedSyncId);
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  if (isApplying) {
    return (
      <div className="text-center p-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mb-4">
        </div>
        <p>Applying new sync code...</p>
        <p className="text-sm text-gray-500 mt-2">The view will reload with the new instance.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-lg mx-auto">
      <div className="mb-6">
        <p className="text-gray-700 mb-2 font-semibold">Your Current Sync Code:</p>
        <div className="flex items-center">
          <div className="bg-gray-100 p-3 rounded-md flex-1 font-mono text-sm overflow-x-auto shadow-inner">
            {currentSyncId}
          </div>
          <button
            onClick={handleCopy}
            className="ml-3 p-2 bg-amber-100 hover:bg-amber-200 rounded-md text-amber-800 transition-colors duration-150 ease-in-out"
            title="Copy sync code"
          >
            {copied ? "Copied!" : "📋 Copy"}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          This code links your browser to a specific Shitty data instance.
        </p>
      </div>

      <div className="bg-amber-50 p-4 rounded-md mb-6 border border-amber-200">
        <h3 className="font-medium text-amber-800 mb-2">How Syncing Works Here:</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm text-amber-700">
          <li>The Sync Code is stored in your browser's local storage.</li>
          <li>Changing the code switches to a different data set.</li>
          <li>To use Shitty on another device with the SAME data, enter this exact Sync Code there.</li>
          <li>Generating a new code effectively creates a fresh, empty Shitty instance for this browser.</li>
        </ul>
      </div>

      <form onSubmit={handleApplyNewCode} className="space-y-4 mb-6">
        <div>
          <label htmlFor="newCode" className="block text-sm font-medium text-gray-700 mb-1">
            Enter an Existing or New Sync Code:
          </label>
          <input
            id="newCode"
            type="text"
            value={newCodeInput}
            onChange={(e) => {
              setNewCodeInput(e.target.value);
              setError("");
            }}
            placeholder="e.g., my-living-room-display"
            className={`w-full p-2 border rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500 ${
              error ? "border-red-500" : "border-gray-300"
            }`}
          />
          {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
        </div>
        <button
          type="submit"
          className="w-full p-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md transition-colors duration-150 ease-in-out disabled:opacity-70"
          disabled={!newCodeInput.trim() || newCodeInput.trim() === currentSyncId || isApplying}
        >
          Apply & Switch Instance
        </button>
      </form>

      <div>
        <button
          onClick={handleGenerateNew}
          className="w-full p-2 bg-orange-500 hover:bg-orange-600 text-white rounded-md transition-colors duration-150 ease-in-out"
        >
          Generate New Unique Code (New Instance)
        </button>
        <p className="text-xs text-gray-500 mt-2 text-center">
          This will start a fresh Shitty instance on this device.
        </p>
      </div>
    </div>
  );
}

// --- END SYNC SETTINGS COMPONENTS ---

function client() {
  const rootElement = document.getElementById("root");
  if (rootElement) {
    createRoot(rootElement).render(<RoutedApp />);
  } else {
    console.error("Root element not found!");
  }
}

if (typeof document !== "undefined") { 
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', client);
  } else {
    client();
  }
}