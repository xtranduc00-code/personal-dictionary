import { getSiteUrl } from "@/lib/site-url";
import { blockSearchIndexing } from "@/lib/search-indexing";

const DESCRIPTION =
    "All-in-one productivity app with IELTS vocabulary notes, AI tools, and learning features.";

export function SeoJsonLd() {
    if (blockSearchIndexing()) {
        return null;
    }
    const url = getSiteUrl();
    const graph = [
        {
            "@type": "WebSite",
            "@id": `${url}/#website`,
            name: "Ken Workspace",
            url,
            description: DESCRIPTION,
            inLanguage: "en",
            publisher: { "@id": `${url}/#organization` },
        },
        {
            "@type": "Organization",
            "@id": `${url}/#organization`,
            name: "Ken Workspace",
            url,
            logo: {
                "@type": "ImageObject",
                url: `${url}/pwa/icon-512.png`,
            },
        },
    ];
    const json = { "@context": "https://schema.org", "@graph": graph };
    return (<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />);
}
