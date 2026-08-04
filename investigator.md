# ARGUS — Investigator Panel Architectural & Script Documentation

This document defines the architectural structure, responsibilities, data flow, and interactive capabilities of the **ARGUS Investigator Panel**, the core operational workspace for detectives and investigating officers.

---

## 1. System Structure & Directory Layout

The Investigator Panel resides primarily inside the `src/components` directory and utilizes shared utilities from `src/contexts` and `src/utils`.

```
src/
├── components/
│   ├── Dashboard.jsx        # Investigator command center & analytics
│   ├── Dashboard.css
│   ├── Map.jsx              # Interactive geospatial monitoring map
│   ├── Map.css
│   ├── ReportCase.jsx       # Case reporting & last-seen geolocation input
│   ├── ReportCase.css
│   ├── CaseDetails.jsx      # Individual case file & radius investigation view
│   ├── CaseDetails.css
│   ├── History.jsx          # Archival case exploration & searching
│   ├── History.css
│   ├── Notifications.jsx    # Real-time system & alert notification center
│   ├── Notifications.css
│   ├── UserProfileModal.jsx # Investigator account management view
│   ├── UserProfileModal.css
│   └── ProtectedRoute.jsx   # Role-based authorization router guard
├── contexts/
│   └── AuthContext.jsx      # Authentication & session identity provider
└── utils/
    ├── logService.js        # Audit and activity logging utility
    ├── geoService.js        # Hybrid GPS hardware detection & OSM Nominatim geocoding
    └── cctvService.js       # Zone-Based CCTV surveillance architecture & alert simulator
```

---

## 2. Core Scripts & Responsibility Breakdown

### `Dashboard.jsx` — Operational Command Center
* **Primary Role:** Serves as the primary overview screen for authenticated investigators (`allowedRole="investigator"`).
* **Core Work:** 
  * Connects to Firebase Firestore (`victims` collection) to pull active case records.
  * Dynamically computes real-time statistics (Total Cases, Missing, Investigating, Found, Cold Cases) utilizing custom animated numerical counters (`CountUp`).
  * Integrates the interactive geospatial view (`<MapComponent />`) and passes live active case records for spatial mapping.
  * Renders quick-action routing to *"Find a Missing Person"* (`/report-case`), *"CCTV Zones & Admin"* (`/cctv-network`), and *"History"* (`/history`).

### `Map.jsx` — Interactive Surveillance & Command Map
* **Primary Role:** Powers the interactive web map embedded in the Dashboard using React-Leaflet and OpenStreetMap tiles.
* **Core Work:**
  * **Clean Node & Pursuit Mapping:** To prevent visual circle clutter on the primary map, geographic zone borders are offloaded to the specialized Admin/Zone console. The map focuses strictly on tactical action layers with toggles for **🎥 CCTV Nodes**, **🚨 Live Detections**, and **👤 Active Subjects**.
  * **Interactive AI Alarm Simulation:** Deployed CCTV camera pins display live node diagnostics (IP addresses, stream resolutions, AI capabilities) and feature a **"🚨 Simulate AI Recognition Alert Here"** demonstration trigger to generate test sightings in real time.
  * **Police Pursuit Tracking Trails:** Automatically maps glowing orange polyline trails connecting a missing subject's initial *Last Seen GPS Location* directly to new surveillance detection coordinates.

### `CctvNetwork.jsx` — Dedicated CCTV Sector & Zone Management Console
* **Primary Role:** Functions as an Admin-grade command interface (`/cctv-network` and `/admin/surveillance`) dedicated to managing surveillance sectors and camera deployments.
* **Core Work:**
  * **Sector Analysis & Filtering:** Provides dedicated tabs for each surveillance zone (e.g., *Western Transit Corridor*, *Southern Gateway*, etc.) with live stats, coverage radius, and precise GPS focal center coordinates.
  * **Simulated AI Surveillance Feeds:** Renders an animated biometric computer vision stream box on each camera card displaying real-time FPS, IP telemetry, and active target detection scanners.
  * **Dynamic Node Deployment:** Enables officers and system admins to deploy new custom CCTV camera nodes directly into any selected zone with a single-click **"Auto-Detect Current GPS"** integration and realistic hardware spec selection.

### `ReportCase.jsx` & `geoService.js` — Hybrid GPS & Case Intake Pipeline
* **Primary Role:** Handles formal registration of missing persons using device-native hardware geolocating.
* **Core Work:**
  * **Hybrid GPS Telemetry:** Eliminates static hardcoded dropdowns in favor of an **"Auto-Detect GPS"** sensor button that harvests real-time hardware device lat/lng and executes reverse-geocoding via OpenStreetMap Nominatim APIs to fill structured address fields.
  * Enforces formatting and mandatory validation on national identifier numbers (NIC), automatically deriving systematic reference codes (`caseId`).
  * Handles multi-file uploads (images and CCTV video footage) directly into Firebase Cloud Storage (`person_media` documents and Cloud storage paths), linking download references directly to the newly created Firestore record.

### `CaseDetails.jsx` — Dedicated Forensic Case Workspace
* **Primary Role:** Delivers deep-dive investigation capabilities for an isolated case file (`/case/:id`).
* **Core Work:**
  * Retrieves and matches victim profile statistics alongside related surveillance media attachments.
  * **Interactive Investigation Map & Search Perimeter:** Renders an embedded interactive map centered on the victim's authentic coordinates, complete with user-adjustable search perimeter radius overlays (e.g., 2km, 5km, 10km zones) and camera detection pursuit polylines.
  * Facilitates official status transitions (`Investigating` $\rightarrow$ `Found`, `Cold`, or `Closed`).
  * Automatically writes structured administrative audit trail entries via `addLog` directly into the system audit registry whenever a case's operational status changes.

### `History.jsx` — Archival & Active Case Repository
* **Primary Role:** Offers comprehensive directory exploration across all historical and active ARGUS case filings.
* **Core Work:**
  * Executes query retrieval from Firestore, rendering standardized status cards with visual priority indicators.
  * Implements multi-attribute filtering (searching simultaneously across Case Names, National ID Cards (NIC), and system reference IDs).
  * Supports custom sorting algorithms (chronological ordering by insertion timestamps and alphabetical sorting).

---

## 3. Geospatial & Surveillance Data Schemas

### Subject Document (`victims` Collection)
```json
{
  "caseId": "CASE-1234",
  "name": "Kamal Perera",
  "status": "Investigating",
  "lastSeenLocation": {
    "lat": 6.9271,
    "lng": 79.8612,
    "name": "Colombo Fort, Western Province",
    "source": "HYBRID_DEVICE_GPS"
  }
}
```

### Surveillance Alert Log (`detections` Collection)
When an AI facial recognition hit or CCTV sighting occurs, real-time alerts are stored with direct linkage to the target case and camera node:
```json
{
  "caseId": "CASE-1234",
  "victimName": "Kamal Perera",
  "cameraId": "CCTV-101",
  "zoneId": "Z01",
  "locationName": "Fort Railway Central Terminal Platform 1",
  "coordinates": {
    "lat": 6.9333,
    "lng": 79.8601
  },
  "confidenceScore": 0.94,
  "alertStatus": "ACTIVE_PURSUIT"
}
```
This standardized dual-collection schema guarantees real-time interoperability between automated CCTV nodes, investigator pursuit displays, and case detail dashboards.
