/**
 * Copyright (c) 2023 MERCENARIES.AI PTE. LTD.
 * All rights reserved.
 */

import { OAIBaseComponent, WorkerContext, OmniComponentMacroTypes } from 'omni-sockets';
import Crawler from 'crawler';
import he from 'he';
import cheerio from 'cheerio';

const NS_OMNI = 'web-crawler';

let component = OAIBaseComponent.create(NS_OMNI, 'web-crawler')
  .fromScratch()
  .set('description', 'Crawls the web content for a list of URLs.')
  .set('title', 'Web Crawler')
  .set('category', 'Data Extraction')
  .setMethod('X-CUSTOM')
  .setMeta({
    source: {
        summary: 'Crawls the web content for a list of URLs.',
        authors: ['Mercenaries.ai Team'],
        links: {
            "Crawler Github": "https://github.com/bda-research/node-crawler",
        }
    }
})
component
  .addInput(
    component.createInput('urls', 'string')
      .set('title', 'URLs')
      .set('description', 'List of URLs to crawl.')
      .setRequired(true)
      .toOmniIO()
  )
  .addInput(
    component.createInput('rateLimit', 'number')
      .set('title', 'Interval (ms)')
      .set('description', 'Minimum time gap between two tasks in milliseconds.')
      .setDefault(0)
      .setRequired(false)
      .toOmniIO()
  )
  // .addInput(
  //   component.createInput('maxConnections', 'number')
  //     .set('description', 'Maximum number of connections.')
  //     .setRequired(false)
  //     .toOmniIO()
  // )
  // .addInput(
  //   component.createInput('userAgent', 'string')
  //     .set('description', 'User-Agent string to set for each request.')
  //     .setRequired(false)
  //     .toOmniIO()
  // )
  .addInput(
    component.createInput('retryLimit', 'number')
      .set('title', 'Max Retry')
      .set('description', 'Maximum number of retries for each task.')
      .setConstraints(0, 10, 1)
      .setDefault(3)
      .setRequired(false)
      .toOmniIO()
  )
  .addInput(
    component.createInput('timeout', 'number')
      .set('title', 'Timeout (ms)')
      .set('description', 'Timeout for each request in milliseconds.')
      .setDefault(15000)
      .setRequired(false)
      .toOmniIO()
  )
  .addInput(
    component.createInput('selector', 'string')
      .set('description', 'Optional selector for operations that require it.')
      .setDefault('body')
      .setRequired(false)
      .toOmniIO()
  )
  .addInput(
    component.createInput('maxDepth', 'number')
        .set('description', 'Maximum depth to crawl.')
        .setConstraints(1, 10, 1)
        .setDefault(1)
        .setRequired(false)
        .toOmniIO()
  ) 
  // .addInput(
  //   component.createInput('headers', 'object')
  //     .set('description', 'Custom headers to set for each request.')
  //     .setRequired(false)
  //     .toOmniIO()
  // )
  // .addInput(
  //   component.createInput('followRedirect', 'boolean')
  //     .set('description', 'Whether to follow redirects.')
  //     .setRequired(false)
  //     .toOmniIO()
  // )
  // .addInput(
  //   component.createInput('referer', 'string')
  //     .set('description', 'Referer header to set for each request.')
  //     .setRequired(false)
  //     .toOmniIO()
  // )
  .addOutput(
    component.createOutput('webContent', 'string')
      .set('description', 'The crawled web content')
      .toOmniIO()
  )
  .setMacro(OmniComponentMacroTypes.EXEC, async (payload: any, ctx: WorkerContext) => {
    const urls = payload.urls.split('\n');
    console.log('urls', urls);
    let webContent = '';
    const selector = payload.selector;
    const maxDepth = payload.maxDepth || 1;
    const crawler = new Crawler({
      maxConnections: 10,
      rateLimit: payload.rateLimit ? payload.rateLimit : 0,
      timeout: payload.timeout ? payload.timeout : 10000, // Default timeout 10000 ms (10 seconds)
      retries: payload.retryLimit ? payload.retryLimit : 3, // Default retry limit is 3
      preRequest: function(options, done) {
        if (options.depth > maxDepth) {
            done(new Error('Max depth reached'));
        } else {
            done();
        }
      }
    });

    try {
        await Promise.all(urls.map((url: string) => {
            return new Promise((resolve, reject) => {
                crawler.queue([{
                    uri: url,
                    depth: 1,
                    callback: (error: Error | null, res: any, done: Function) => {
                      if (error) {
                        console.error(error);
                        reject(error);
                      } else {
                          let htmlContent = res.body;
                          htmlContent = htmlContent.replace(/{{<a /g, "{{&lt;a ");
                          const $ = cheerio.load(htmlContent);
                          if ($) {
                            $('script').remove();
                            $('style').remove();
                            $('iframe').remove();
                            $('input').remove();
                            $('form').remove();
                            $('head').remove();
                            $('footer').remove();
                            $('nav').remove();
                            $('img').remove();  // remove if images are not needed
                            $('audio').remove();  // remove if audio elements are not needed
                            $('video').remove();  // remove if video elements are not needed
                            $('a').removeAttr('href');  // remove if links are not needed
                        
                            $('*').removeAttr('style');  // remove style attributes from all elements
                            // $('*').removeAttr((index, name) => name.startsWith('on') ? name : undefined);  // remove all attributes starting with 'on'
                            
                            // Removing all comments
                            $.root().contents().filter((index, element) => element.type === 'comment').remove(); 
                        

                            let extractedContent = '';
                            try {
                              if (selector?.trim()) {
                                  extractedContent = $(selector).text(); // or .text() depending on what you want to extract
                              } else {
                                  extractedContent = $('body').text();
                              }
                            } catch (error) {
                                console.error('Error with selector, falling back to "body":', error);
                                try {
                                    extractedContent = $('body').text();
                                } catch (fallbackError) {
                                    console.error('Error even with fallback to "body":', fallbackError);
                                }
                            }

                            if (extractedContent) {
                              // Decode HTML entities
                              const decodedContent = he.decode(extractedContent);
                      
                              // Remove extra whitespaces
                              const cleanContent = decodedContent.replace(/\s\s+/g, ' ').trim();
                      
                              webContent += cleanContent;
                            } else {
                                console.error('No content extracted. Possible issue with the page structure or selector.');
                            }

                            // If not reached max depth, queue links from this page to be crawled
                            if (res.options.depth < maxDepth) {
                                const links = $('a').map((i, el) => $(el).attr('href')).get();
                                links.forEach(link => {
                                    crawler.queue({
                                        uri: link,
                                        depth: res.options.depth + 1
                                    });
                                });
                            }
                        }
                        resolve(null);
                    }
                    done();
                    }
              }]);
          });
      }));
  } catch (error) {
      console.error('Error while crawling:', error);
      // Handle error appropriately here
  }
  
  return { webContent };
});
const WebCrawlerComponent = component.toJSON();

export default {
    createComponents: () => ({
      blocks: [WebCrawlerComponent],
      patches: []
    })
}