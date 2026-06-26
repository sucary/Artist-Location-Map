# Achizu

<img width="959" height="419" alt="image" src="https://github.com/user-attachments/assets/7c882ff0-e96b-493f-9072-307a27216d92" />











Achizu is a website where you can
- manage your artist (musician) collection;
- visualizes the geographic distribution of your artists on a map: where they're from and where they're currently based.
- Manage and visualize your favorite gigs

Inspired by [Anitabi](https://www.anitabi.cn/map), an interactive map website visualizing real-world locations of anime scenes.

## Features

**1. Create your own artist world map by adding artists**
- Import artist from MusicBrainz database, within few clicks;
- or create your own artist.

**2. Interact with the map**
- A cluster view keeping your artist layout intact at any zoom level.
- Click an artist marker to see the profile.
- Toggle map tile styles and location views.

**3. Create your tour itinerary**
   - Track your favorite artists' live schedule.
   - Combining gigs, map and calendar, you can easily plan a concert itinerary for your next trip!

**4. Interact with others**
- Sneak peek at other users' maps.
- Copy other's artist collection to your map.
- Featured artists: randomly selected artists across the world, from different users.

**5. Accessibility:** The website is screen reader friendly. Create and manage your artist location set, even if you are unable to use a map.


## Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL with PostGIS, Supabase
- **Frontend:** React, Vite, Tailwind CSS
- **Maps:** MapLibre GL, Carto basemaps, MapTiler
- **Authentication:** Supabase Auth
- **Image Storage:** Cloudinary
- **Geocoding:** LocationIQ (Nominatim), Overpass, Geoapify
