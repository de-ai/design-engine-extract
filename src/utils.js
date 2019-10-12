#!/usr/bin/env node
'use strict';

import stringify from 'json-stringify-safe';


export async function captureElementImage(element, encoding='binary') {
	const boundingBox = await element.boundingBox();
	const padding = 10;

	return (await element.screenshot({ encoding,
		clip : {
			x      : boundingBox.x - padding,
			y      : boundingBox.y - padding,
			width  : boundingBox.width + padding * 2,
			height : boundingBox.height + padding * 2,
		}
	}));
}

export async function captureScreenImage(page, encoding='base64') {
	return (await page.screenshot({ encoding,
		fullPage : true
	}));
}

export async function extractElements(page) {
	const elements = {
		'buttons'    : await Promise.all((await page.$$('button, input[type="button"], input[type="submit"]', (nodes)=> (nodes))).map(async(node)=> (await processNode(page, node)))),
		'headings'   : await Promise.all((await page.$$('h1, h2, h3, h4, h5, h6', (nodes)=> (nodes))).map(async(node)=> (await processNode(page, node)))),
		'icons'      : (await Promise.all((await page.$$('img, svg', (nodes)=> (nodes))).map(async(node)=> (await processNode(page, node))))).filter((icon)=> (icon.bounds.x <= 32 && icon.bounds.y <= 32)),
		'images'     : await Promise.all((await page.$$('img', (nodes)=> (nodes))).map(async(node)=> (await processNode(page, node)))),
		'links'      : await Promise.all((await page.$$('a', (nodes)=> (nodes))).map(async(node)=> (await processNode(page, node)))),
		'textfields' : await Promise.all((await page.$$('input:not([type="checkbox"]), input:not([type="radio"])', (nodes)=> (nodes))).map(async(node)=> (await processNode(page, node)))),
		'videos'     : await Promise.all((await page.$$('video', (nodes)=> (nodes))).map(async(node)=> (await processNode(page, node)))),
	};

	return (elements)
}

export async function extractMeta(page, elements) {
	return ({
		colors : {
			bg : [ ...new Set(Object.keys(elements).map((key)=> (elements[key].map((element)=> (element.styles['background'].replace(/ none.*$/, ''))))).flat(Infinity))],
			fg : [ ...new Set(Object.keys(elements).map((key)=> (elements[key].map((element)=> (element.styles['color'])))).flat(Infinity))]
		},
		fonts  : [ ...new Set(Object.keys(elements).map((key)=> (elements[key].map((element)=> (element.styles['font-family'])))).flat(Infinity))]
	});
}


const processNode = async(page, node)=> {
	let bounds = await node.boundingBox();
	if (bounds) {
		Object.keys(bounds).forEach((key)=> {
			bounds[key] = (bounds[key] << 0);
		});
	}

	const children = await Promise.all((await node.$$('*', (nodes)=> (nodes))).map(async(node)=> (await processNode(page, node))));
	const attribs = await page.evaluate((el)=> {
		const styles = elementStyles(el);

		return ({
			title   : (el.hasAttribute('alt') && el.alt.length > 0) ? el.alt : (el.hasAttribute('value') && el.value.length > 0) ? el.value : el.textContent,
			html    : el.outerHTML.replace(/"/g, '\\"'),
			styles  : styles,
			classes : (el.className.length > 0) ? el.className : '',
			meta    : {
				border      : styles['border'],
				color       : elementColor(styles),
				font        : elementFont(styles),
				text        : (el.text || ''),
				placeholder : (el.hasAttribute('placeholder')) ? el.placeholder : null,
				href        : (el.hasAttribute('href')) ? el.href : null,
				data        : (el.tagName === 'IMG' && el.hasAttribute('src')) ? imageData(el, elementBounds(el, styles).size) : null,
				url         : (el.hasAttribute('src')) ? el.src : (el.childElementCount > 0 && el.firstElementChild.hasAttribute('src')) ? el.firstElementChild.src : null,
			}
		});
	}, node);

	return ({...attribs, children, bounds,
		title : ((attribs.title.length === 0) ? (attribs.meta.text.length === 0 && children.length > 0) ? (await node.$$eval('*', (els)=> els.map(({ innerHTML })=> (innerHTML)))).filter((innerHTML)=> (innerHTML.length > 0 && !/^<.+>$/.test(innerHTML))).pop() : attribs.meta.text : attribs.title),
		meta  : { ...attribs.meta,
			text : ((attribs.meta.text.length === 0 && children.length > 0) ? (await node.$$eval('*', (els)=> els.map(({ innerHTML })=> (innerHTML)))).filter((innerHTML)=> (innerHTML.length > 0 && !/^<.+>$/.test(innerHTML))).pop() : attribs.title)
		},
		box  : await node.boxModel()
	});
};