import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import { SITE_DESCRIPTION, SITE_TITLE } from "../consts";

export async function GET(context) {
  const allPosts = await getCollection("blog");

  // Combine all posts with correct URLs
  const items = allPosts.map((post) => {
    const isEnglish = post.id.startsWith("en/");
    const slug = post.id.replace(/^(zh|en)\//, "");
    const link = isEnglish ? `/en/blog/${slug}/` : `/blog/${slug}/`;

    return {
      ...post.data,
      link,
    };
  });

  // Sort by date
  items.sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site,
    items,
  });
}
