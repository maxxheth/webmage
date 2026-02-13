import scrapy
from scrapy.crawler import CrawlerProcess
from scrapy.signalmanager import dispatcher
from scrapy import signals
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
import uvicorn
import threading
import json

app = FastAPI(title="Webmage Scrapy Crawler", version="1.0.0")


class CrawlRequest(BaseModel):
    url: str
    max_pages: Optional[int] = 100
    max_depth: Optional[int] = 3


class PageCrawlRequest(BaseModel):
    url: str


class SEOSpider(scrapy.Spider):
    """Spider that extracts SEO-relevant data from every page."""
    name = "seo_spider"

    def __init__(self, start_url, max_pages=100, max_depth=3, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.start_urls = [start_url]
        self.allowed_domains = [start_url.split("//")[1].split("/")[0].split(":")[0]]
        self.max_pages = max_pages
        self.max_depth = max_depth
        self.pages_crawled = 0
        self.results = []

    def parse(self, response):
        if self.pages_crawled >= self.max_pages:
            return

        self.pages_crawled += 1

        page_data = {
            "url": response.url,
            "status_code": response.status,
            "title": response.css("title::text").get(""),
            "meta_description": response.css('meta[name="description"]::attr(content)').get(""),
            "h1": response.css("h1::text").getall(),
            "h2": response.css("h2::text").getall(),
            "h3": response.css("h3::text").getall(),
            "h4": response.css("h4::text").getall(),
            "h5": response.css("h5::text").getall(),
            "h6": response.css("h6::text").getall(),
            "internal_links": [],
            "external_links": [],
            "images": [],
            "word_count": len(response.css("body *::text").getall()),
            "schema_types": response.css('script[type="application/ld+json"]::text').getall(),
            "canonical": response.css('link[rel="canonical"]::attr(href)').get(""),
            "og_tags": {},
            "response_time_ms": 0,
        }

        # Extract links
        for link in response.css("a::attr(href)").getall():
            full_url = response.urljoin(link)
            if any(domain in full_url for domain in self.allowed_domains):
                page_data["internal_links"].append(full_url)
            else:
                page_data["external_links"].append(full_url)

        # Extract images
        for img in response.css("img"):
            src = img.attrib.get("src", "")
            alt = img.attrib.get("alt", "")
            page_data["images"].append({
                "src": response.urljoin(src),
                "alt": alt,
                "missing_alt": not alt.strip(),
            })

        # Extract OG tags
        for og in response.css('meta[property^="og:"]'):
            prop = og.attrib.get("property", "").replace("og:", "")
            content = og.attrib.get("content", "")
            page_data["og_tags"][prop] = content

        # Parse schema types
        schema_types = []
        for schema_text in page_data["schema_types"]:
            try:
                schema = json.loads(schema_text)
                if isinstance(schema, dict) and "@type" in schema:
                    schema_types.append(schema["@type"])
                elif isinstance(schema, list):
                    for item in schema:
                        if isinstance(item, dict) and "@type" in item:
                            schema_types.append(item["@type"])
            except json.JSONDecodeError:
                pass
        page_data["schema_types"] = schema_types

        self.results.append(page_data)

        # Follow internal links
        if response.meta.get("depth", 0) < self.max_depth:
            for link in page_data["internal_links"]:
                yield scrapy.Request(link, callback=self.parse)


def run_crawl(start_url: str, max_pages: int = 100, max_depth: int = 3) -> dict:
    """Run a Scrapy crawl and return results as a dictionary."""
    results = []

    def collect_items(item, response, spider):
        pass

    process = CrawlerProcess(settings={
        "LOG_LEVEL": "WARNING",
        "CONCURRENT_REQUESTS": 8,
        "DOWNLOAD_DELAY": 0.25,
        "ROBOTSTXT_OBEY": True,
        "DEPTH_LIMIT": max_depth,
        "CLOSESPIDER_PAGECOUNT": max_pages,
        "USER_AGENT": "Webmage-SEO-Crawler/1.0 (+https://webmage.dev)",
        "HTTPCACHE_ENABLED": False,
    })

    spider_results = []

    def spider_closed(spider):
        spider_results.extend(spider.results)

    dispatcher.connect(spider_closed, signal=signals.spider_closed)

    process.crawl(SEOSpider, start_url=start_url, max_pages=max_pages, max_depth=max_depth)
    process.start()

    from urllib.parse import urlparse
    domain = urlparse(start_url).hostname

    return {
        "domain": domain,
        "crawled_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "total_pages": len(spider_results),
        "pages": spider_results,
        "errors": [],
    }


@app.get("/health")
async def health():
    return {"status": "ok", "service": "webmage-scrapy"}


@app.post("/crawl")
async def crawl(request: CrawlRequest):
    """Full site crawl - runs in a thread to avoid blocking."""
    import asyncio
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, run_crawl, request.url, request.max_pages, request.max_depth
    )
    return result


@app.post("/crawl/page")
async def crawl_page(request: PageCrawlRequest):
    """Crawl a single page."""
    import asyncio
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, run_crawl, request.url, 1, 0
    )
    return result


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=6800)
