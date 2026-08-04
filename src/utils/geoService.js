import { db } from '../firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Capture real-time device GPS coordinates via HTML5 Geolocation API.
 * Returns a Promise resolving to { lat, lng, accuracy }.
 */
export const getDeviceGPS = () => {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation is not supported by this browser/device."));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: parseFloat(position.coords.latitude.toFixed(6)),
                    lng: parseFloat(position.coords.longitude.toFixed(6)),
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                reject(error);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
};

export const getCurrentDevicePosition = getDeviceGPS;

/**
 * Convert Latitude & Longitude to physical street/district address using OpenStreetMap Nominatim API.
 */
export const reverseGeocode = async (lat, lng) => {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
            headers: {
                'Accept-Language': 'en'
            }
        });
        if (!response.ok) throw new Error("Failed to reach OpenStreetMap Nominatim service");
        const data = await response.json();
        const city = data.address?.city || data.address?.town || data.address?.village || data.address?.suburb || "Sri Lanka Area";
        const district = data.address?.state_district || data.address?.county || data.address?.state || "Region";
        return {
            displayName: data.display_name || `${city}, ${district}`,
            city: city,
            district: district
        };
    } catch (error) {
        console.error("Reverse geocoding error:", error);
        return {
            displayName: `GPS: ${lat}, ${lng}`,
            city: "Custom GPS Coordinates",
            district: "GPS Data"
        };
    }
};

/**
 * Register a real-time surveillance camera detection alert for Police Pursuit & Trail Mapping.
 */
export const logCameraDetection = async (caseId, victimName, cameraId, locationName, lat, lng, confidenceScore = 0.92) => {
    try {
        const detectionRef = collection(db, 'detections');
        await addDoc(detectionRef, {
            caseId: caseId,
            victimName: victimName,
            cameraId: cameraId,
            locationName: locationName,
            coordinates: {
                lat: parseFloat(lat),
                lng: parseFloat(lng)
            },
            confidenceScore: confidenceScore,
            timestamp: serverTimestamp(),
            alertStatus: "ACTIVE_PURSUIT"
        });
        return true;
    } catch (error) {
        console.error("Error registering surveillance detection:", error);
        throw error;
    }
};
