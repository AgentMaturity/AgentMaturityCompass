#!/usr/bin/env node

import { Context } from '@amc/cordis'
import { pathToFileURL } from 'node:url'
import Loader from '@amc/cordis-plugin-loader'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@amc/cordis-plugin-include',
  config: {
    path: './cordis.yml',
  },
})
