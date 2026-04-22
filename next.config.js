/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},  // This silences the warning
  images: {
    domains: ['sanga.africa', 'localhost'],
  },
}

module.exports = nextConfig
