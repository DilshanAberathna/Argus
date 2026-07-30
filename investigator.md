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
    └── logService.js        # Audit and activity logging utility
```

---

## 2. Core Scripts & Responsibility Breakdown

### `Dashboard.jsx` — Operational Command Center
* **Primary Role:** Serves as the primary overview screen for authenticated investigators (`allowedRole="investigator"`).
* **Core Work:** 
  * Connects to Firebase Firestore (`victims` collection) to pull active case records.
  * Dynamically computes real-time statistics (Total Cases, Missing, Investigating, Found, Cold Cases) utilizing custom animated numerical counters (`CountUp`).
  * Integrates the interactive geospatial view (`<MapComponent />`) and passes live active case records for spatial mapping.
  * Renders quick-action routing to *"Find a Missing Person"* (`/report-case`) and *"History"* (`/history`).

### `Map.jsx` — Interactive Geospatial Surveillance & Mapping
* **Primary Role:** Powers the interactive web map embedded in the Dashboard using React-Leaflet and OpenStreetMap tiles.
* **Core Work:**
  * Constricts viewport panning to national boundaries (e.g., Sri Lanka coordinates) for focused operational usability.
  * Renders dynamic case pin markers based on latitude/longitude coordinates logged in case files (`lastSeenLocation`).
  * Displays interactive popup summaries on pin selection containing victim identity, classification status badge, photo thumbnail, and a direct `"View Case File"` routing link.

### `ReportCase.jsx` — Case Intake & Geocoding Pipeline
* **Primary Role:** Handles the formal registration and database entry of missing persons or investigation targets.
* **Core Work:**
  * Enforces formatting and mandatory validation on national identifier numbers (NIC), automatically deriving systematic reference codes (`caseId`).
  * Captures **Last Seen Location** via interactive District/City dropdown selection paired with exact latitude/longitude coordinates.
  * Handles multi-file uploads (images and CCTV video footage) directly into Firebase Cloud Storage (`person_media` documents and Cloud storage paths), linking download references directly to the newly created Firestore record.

### `CaseDetails.jsx` — Dedicated Forensic Case Workspace
* **Primary Role:** Delivers deep-dive investigation capabilities for an isolated case file (`/case/:id`).
* **Core Work:**
  * Retrieves and matches victim profile statistics alongside related surveillance media attachments.
  * **Interactive Investigation Map & Search Perimeter:** Replaces static placeholders with an embedded interactive map centered on the victim's last known coordinates, complete with user-adjustable search perimeter radius overlays (e.g., 2km, 5km, 10km zones).
  * Facilitates official status transitions (`Investigating` $\rightarrow$ `Found`, `Cold`, or `Closed`).
  * Automatically writes structured administrative audit trail entries via `addLog` directly into the system audit registry whenever a case's operational status changes.

### `History.jsx` — Archival & Active Case Repository
* **Primary Role:** Offers comprehensive directory exploration across all historical and active ARGUS case filings.
* **Core Work:**
  * Executes query retrieval from Firestore, rendering standardized status cards with visual priority indicators.
  * Implements multi-attribute filtering (searching simultaneously across Case Names, National ID Cards (NIC), and system reference IDs).
  * Supports custom sorting algorithms (chronological ordering by insertion timestamps and alphabetical sorting).

### `Notifications.jsx` & `UserProfileModal.jsx` — Support Modules
* **Primary Role:** Lightweight overlay modals providing contextual awareness and profile management.
* **Core Work:**
  * Renders actionable security and system updates inside an expandable notification drawer.
  * Displays logged-in investigator credentials retrieved dynamically from `AuthContext`.

---

## 3. Geospatial Data Schema (`lastSeenLocation`)

When cases are logged or manipulated, geolocation data is structured within Firestore under the victim's document:

```json
{
  "caseId": "Case-1234",
  "name": "Kamal Perera",
  "status": "Investigating",
  "lastSeenLocation": {
    "district": "Colombo",
    "city": "Fort",
    "lat": 6.9271,
    "lng": 79.8612,
    "description": "Near Central Bus Station"
  }
}
```
This standardized schema guarantees immediate interoperability between `ReportCase.jsx` intake forms, `Dashboard.jsx` national visualizers, and `CaseDetails.jsx` forensic search radius projectors.
