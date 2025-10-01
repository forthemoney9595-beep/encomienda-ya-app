'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

// Fix for default icon issues. This is a common problem with bundlers like Webpack.
// We are resetting the icon paths to point to the correct images from the leaflet package.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});


interface OrderRouteProps {
    start: L.LatLngExpression;
    end: L.LatLngExpression;
}

const OrderRoute = ({ start, end }: OrderRouteProps) => {
    const map = useMap();

    useEffect(() => {
        if (!map || !start || !end) return;

        const routingControl = L.Routing.control({
            waypoints: [
                L.latLng(start as L.LatLngTuple),
                L.latLng(end as L.LatLngTuple)
            ],
            routeWhileDragging: false,
            show: false, // Hide the turn-by-turn instructions
            addWaypoints: false,
            draggableWaypoints: false,
            fitSelectedRoutes: true,
            lineOptions: {
                styles: [{ color: 'hsl(var(--primary))', opacity: 0.8, weight: 6 }]
            },
            createMarker: function() { return null; } // Do not create default markers
        }).addTo(map);

        return () => {
            if (map && routingControl) {
               map.removeControl(routingControl);
            }
        };
    }, [map, start, end]);

    return null;
}

export default OrderRoute;
