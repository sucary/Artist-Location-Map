import type { Artist } from '../types/artist';
import { HomeIcon, MusicIcon, YoutubeIcon, InstagramIcon, XIcon } from './Icons/SocialIcons';

interface ArtistProfileProps {
    artist: Artist;
}

const ArtistProfile = ({ artist }: ArtistProfileProps) => {
    return (
        <div className="w-80 flex flex-col rounded-lg bg-white shadow-lg overflow-hidden">
            <div 
                className="relative w-full h-24 bg-cover bg-center"
                style={{
                    backgroundImage: `url(${artist.profilePicture || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=500&q=60'})`,
                }}
            >
                <div className="absolute inset-0 bg-black/5" />

                <div className="relative z-10 flex items-center gap-4 px-4 h-full">
                    {/* TODO: 
                        1.
                        2. Remove the avatar border when ready
                        3. Separate the avatar and baclground image
                        
                    */}
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-black shrink-0">
                        <img 
                            src={artist.profilePicture || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=150&h=150'}
                            alt={artist.name} 
                            className="w-full h-full object-cover" 
                        />

                    </div>
                    <div>
                        <h3
                            className="font-bold text-lg leading-tight text-white"
                            style={{ textShadow: '0 0 4px rgba(0,0,0,0.8)' }}
                        >
                            {artist.name}
                        </h3>
                        <p
                            className="text-sm text-gray-300"
                            style={{ textShadow: '0 0 4px rgba(0,0,0,0.8)' }}
                        >
                            {artist.activeLocation.city}, {artist.activeLocation.province}
                        </p>
                    </div>
                </div>
            </div>

            {/* The bottom half of the card: original location and social media */}

            <div className="flex flex-col p-4 gap-4">
                <div className="flex flex-row items-center justify-between w-full">
                    <div className="text-gray-500 text-sm">From</div>
                    <div className="text-gray-500 text-sm">
                        {artist.originalLocation.city}, {artist.originalLocation.province}
                    </div>
                </div>

                <div className="h-px w-full bg-gray-200" />

                <div className="flex flex-row items-center justify-between w-full">
                    <div className="text-gray-500 text-sm">Links</div>
                    <div className="flex gap-1">
                        {artist.socialLinks?.website && (
                            <a href={artist.socialLinks.website} target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#FA2D48] transition-colors">
                                <HomeIcon className="w-4 h-4" />
                            </a>
                        )}
                        {artist.socialLinks?.appleMusic && (
                            <a href={artist.socialLinks.appleMusic} target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#FA2D48] transition-colors">
                                <MusicIcon className="w-4 h-4" />
                            </a>
                        )}
                        {artist.socialLinks?.youtube && (
                        <a href={artist.socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#FA2D48] transition-colors">
                             <YoutubeIcon className="w-4 h-4" />
                        </a>
                        )}
                        {artist.socialLinks?.instagram && (
                            <a href={artist.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#FA2D48] transition-colors">
                                <InstagramIcon className="w-4 h-4" />
                            </a>
                        )}
                        {artist.socialLinks?.twitter && (
                            <a href={artist.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#FA2D48] transition-colors">
                                <XIcon className="w-4 h-4" />
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ArtistProfile;
