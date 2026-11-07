//Configures Next.js build output and image optimization settings for deployment and external image sources.
export default { 
    output: "standalone",
     images: { 
        remotePatterns: [
            { 
                protocol: "https",
                hostname: "image.tmdb.org" 
            }
        ] 
    } 
};
