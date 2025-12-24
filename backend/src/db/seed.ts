import { ArtistStore } from '../models/artistStore';
import pool from '../config/database';
import { CreateArtistDTO } from '../types/artist';

// Sample artist data to seed the database

const sampleArtists: CreateArtistDTO[] = [
    {
        name: "Snooty",
        profilePicture: undefined,
        originalLocation: {
            city: "Fukuoka",
            province: "Fukuoka",
            coordinates: { lat: 33.5902, lng: 130.4017 }
        },
        activeLocation: {
            city: "Fukuoka",
            province: "Fukuoka",
            coordinates: { lat: 33.5902, lng: 130.4017 }
        },
        socialLinks: {
            instagram:"https://www.instagram.com/snooty_official_desu/"
        }
    },
    {
        name: "Unfair Rule",
        profilePicture: undefined,
        originalLocation: {
            city: "Okayama",
            province: "Okayama",
            coordinates: { lat: 34.6551, lng: 133.9195 }
        },
        activeLocation: {
            city: "Tokyo",
            province: "Tokyo",
            coordinates: { lat: 35.6762, lng: 139.6503}
        },
        socialLinks: {
            instagram:"https://www.instagram.com/unfair_rule/"
        }
    }
];

async function seedDatabase() {
    try {
        console.log('Starting database seed...');
        
        // Clear existing data
        await pool.query('DELETE FROM artists');
        console.log('Cleared existing artists');

        // Insert new artists
        for (const artist of sampleArtists) {
            await ArtistStore.create(artist);
            console.log(`Created artist: ${artist.name}`);
        }

        console.log('Database seeded successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}

seedDatabase();