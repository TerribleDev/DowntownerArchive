
# Newsletter Embed Route Documentation

This documentation explains how to embed The Downtowner newsletter content into any website using our embed route.

## Quick Start

Add the following code to your website where you want the newsletter content to appear:

```html
<script>
class NewsletterEmbed extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    async connectedCallback() {
        try {
            const response = await fetch('https://downtowner.terrible.dev/embed');
            const html = await response.text();
            this.shadowRoot.innerHTML = html;
        } catch (error) {
            console.error('Failed to load newsletter content:', error);
            this.shadowRoot.innerHTML = '<p>Failed to load newsletter content</p>';
        }
    }
}

customElements.define('newsletter-embed', NewsletterEmbed);
</script>

<newsletter-embed></newsletter-embed>
```

## Features

- Responsive grid layout
- Dark mode support
- Style isolation using Shadow DOM
- Displays up to 6 recent newsletters
- Each newsletter card includes:
  - Title
  - Publication date
  - Thumbnail image (if available)
  - Description
  - Read more link

## Customization

The embed route uses CSS variables for theming. You can override these variables in your website's CSS:

```css
newsletter-embed {
  --background: #ffffff;
  --foreground: #000000;
  --card: #ffffff;
  --card-foreground: #000000;
  --primary: #000000;
  --border: #e2e8f0;
}
```

## Demo

You can view a live demo of the embed functionality at `/embed-demo.html` on your Repl.

## CORS

The embed route has CORS enabled, allowing it to be embedded on any domain.
