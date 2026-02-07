# Wiki Content for Crispy Enigma

This directory contains the content for the Crispy Enigma GitHub Wiki. Follow the instructions below to set up the wiki.

## Contents

This wiki provides comprehensive documentation for the multi-tenant Cloudflare Workers AI platform:

- **[Home.md](Home.md)** — Wiki landing page with overview
- **[Getting-Started.md](Getting-Started.md)** — Installation and setup guide
- **[Architecture.md](Architecture.md)** — Deep dive into system design
- **[Multi-Tenancy.md](Multi-Tenancy.md)** — Tenant isolation patterns and best practices
- **[Development-Guide.md](Development-Guide.md)** — Development workflow and tooling
- **[Testing-Guide.md](Testing-Guide.md)** — Testing strategies and patterns
- **[Security-Best-Practices.md](Security-Best-Practices.md)** — Security guidelines
- **[API-Reference.md](API-Reference.md)** — Endpoint documentation
- **[Troubleshooting.md](Troubleshooting.md)** — Common issues and solutions
- **[Milestones.md](Milestones.md)** — Project roadmap and completed milestones
- **[References.md](References.md)** — Links to resources and documentation

## Setting Up the GitHub Wiki

GitHub Wikis are separate Git repositories. Follow these steps to set up the wiki:

### Option 1: Using GitHub Web Interface

1. **Enable the Wiki:**
   - Go to https://github.com/rainbowkillah/crispy-enigma/settings
   - Scroll to "Features" section
   - Check "Wikis"

2. **Create Wiki Pages:**
   - Go to https://github.com/rainbowkillah/crispy-enigma/wiki
   - Click "Create the first page"
   - For each file in this directory:
     - Click "New Page"
     - Copy the filename (without `.md` extension) as the page title
     - Copy the file contents into the editor
     - Click "Save Page"

### Option 2: Using Git (Recommended)

1. **Clone the wiki repository:**
   ```bash
   git clone https://github.com/rainbowkillah/crispy-enigma.wiki.git
   cd crispy-enigma.wiki
   ```

2. **Copy wiki content:**
   ```bash
   # From the main repository
   cp ../crispy-enigma/wiki-content/*.md .
   ```

3. **Commit and push:**
   ```bash
   git add .
   git commit -m "Add comprehensive wiki documentation"
   git push origin master
   ```

4. **Verify:**
   - Visit https://github.com/rainbowkillah/crispy-enigma/wiki
   - All pages should be visible

### Option 3: Using a Script

Save this script as `setup-wiki.sh`:

```bash
#!/bin/bash

# Clone wiki repository
git clone https://github.com/rainbowkillah/crispy-enigma.wiki.git
cd crispy-enigma.wiki

# Copy wiki content
cp ../wiki-content/*.md .

# Commit and push
git add .
git commit -m "Add comprehensive wiki documentation

Includes:
- Home page with overview
- Getting Started guide
- Architecture documentation
- Multi-Tenancy patterns
- Development Guide
- Testing Guide
- Security Best Practices
- API Reference
- Troubleshooting guide
- Milestones and roadmap
- References and links
"
git push origin master

echo "Wiki setup complete!"
echo "Visit https://github.com/rainbowkillah/crispy-enigma/wiki"
```

Then run:
```bash
chmod +x setup-wiki.sh
./setup-wiki.sh
```

## Wiki Structure

The wiki is organized as follows:

```
Home (Landing)
├── Getting Started
│   ├── Installation
│   ├── Configuration
│   └── First Steps
├── Core Concepts
│   ├── Architecture
│   ├── Multi-Tenancy
│   └── Security Best Practices
├── Development
│   ├── Development Guide
│   ├── Testing Guide
│   └── Troubleshooting
└── Reference
    ├── API Reference
    ├── Milestones
    └── References
```

## Navigation

Each page includes:
- Internal links to related pages
- "Next Steps" sections for guided learning
- Cross-references between concepts

Example navigation path for new developers:
1. **Home** → Overview and status
2. **Getting Started** → Setup and installation
3. **Architecture** → Understand the system
4. **Multi-Tenancy** → Learn tenant patterns
5. **Development Guide** → Start coding
6. **Testing Guide** → Write tests
7. **API Reference** → Explore endpoints

## Maintenance

### Updating Content

To update wiki content:

1. **Edit in this repository:**
   ```bash
   cd wiki-content
   # Edit files
   git add .
   git commit -m "Update wiki content"
   git push
   ```

2. **Update wiki:**
   ```bash
   cd ../crispy-enigma.wiki
   cp ../crispy-enigma/wiki-content/*.md .
   git add .
   git commit -m "Update wiki content"
   git push origin master
   ```

### Adding New Pages

1. Create new `.md` file in `wiki-content/`
2. Add links to the new page in related pages
3. Update Home.md to include the new page
4. Follow the update process above

## Features

### Comprehensive Coverage

- ✅ Project overview and status
- ✅ Installation and setup instructions
- ✅ Architecture deep dive
- ✅ Multi-tenancy patterns and security
- ✅ Development workflow and best practices
- ✅ Testing strategies
- ✅ Security guidelines
- ✅ API documentation
- ✅ Troubleshooting guide
- ✅ Project roadmap
- ✅ External references and links

### Code Examples

All guides include:
- Working code examples
- TypeScript type annotations
- ✅ Good / ❌ Bad pattern comparisons
- Command-line examples

### Cross-References

Pages link to related content:
- Internal wiki pages
- Repository documentation (`/docs`)
- External resources (Cloudflare docs, etc.)

## Acknowledgments

This wiki was generated based on:
- Project documentation in `/docs`
- Copilot instructions in `.github/copilot-instructions.md`
- Code patterns and examples from the repository
- M0 and M1 milestone learnings

## Support

If you have questions or suggestions for the wiki:
- Open an issue: https://github.com/rainbowkillah/crispy-enigma/issues
- Refer to [Troubleshooting](Troubleshooting.md) page
- Check [References](References.md) for external resources

## License

Same license as the main project. See [LICENSE](../LICENSE).
