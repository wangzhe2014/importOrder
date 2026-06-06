/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    cpus: 1,
    serverComponentsExternalPackages: [
      'mammoth',
      'pdf-parse',
      'pdf2json',
      'textract',
      'xlsx',
    ],
  },
}

module.exports = nextConfig
