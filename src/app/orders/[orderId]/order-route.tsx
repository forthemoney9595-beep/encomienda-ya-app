'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

// Fix for default icon issues with webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png').default,
  iconUrl: require('leaflet/dist/images/marker-icon.png').default,
  shadowUrl: require('leaflet/dist/images/marker-shadow.png').default,
});


interface OrderRouteProps {
    start: L.LatLngExpression;
    end: L.LatLngExpression;
}

const OrderRoute = ({ start, end }: OrderRouteProps) => {
    const map = useMap();

    useEffect(() => {
        if (!map) return;

        const routingControl = L.Routing.control({
            waypoints: [
                L.latLng(start as L.LatLng),
                L.latLng(end as L.LatLng)
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
            map.removeControl(routingControl);
        };
    }, [map, start, end]);

    return null;
}

export default OrderRoute;
