# Achizu

<img width="2560" height="650" alt="image" src="https://github.com/user-attachments/assets/d38b665b-406c-4f1d-98c0-ebccaf944127" />




Achizu is a website where you can
- manage your artist (musician) collection;
- visualizes the geographic distribution of your artists on a map: where they're from and where they're currently based.

Inspired by [Anitabi](https://www.anitabi.cn/map), an interactive map website visualizing real-world locations of anime scenes.

## Features

1. Create your own artist world map by adding artists
    - Import artist from MusicBrainz database, within few clicks;
    - or create your own artist.

2. Interact with the map
    - A cluster view keeping your artist layout intact at any zoom level.
    - Click an artist marker to see the profile.
    - Toggle map tile styles and location views.

3. Interact with others
    - Sneak peek at other users' maps.
    - Copy other's artist collection to your map.
    - Featured artists: randomly selected artists across the world, from different users.

4. Accessibility: The website is screen reader friendly. Create and manage your artist location set, even if you are unable to use a map.

## Upcoming
1. Localization in Chinese and Japanese.
2. Calendar integration, where you can track artists' live schedule and view them on a map. Great for planning your next live itinerary!

## Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL with PostGIS, Supabase
- **Frontend:** React, Vite, Tailwind CSS
- **Maps:** MapLibre GL, Carto basemaps, MapTiler
- **Authentication:** Supabase Auth
- **Image Storage:** Cloudinary
- **Geocoding:** LocationIQ (Nominatim), Overpass
