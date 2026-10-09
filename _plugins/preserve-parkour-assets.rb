# Vite already minifies these ES modules. Preserve module syntax and model-adjacent
# runtime bytes instead of passing top-level await through Jekyll's older Terser.
module Jekyll
  class PreserveParkourAssets < Generator
    safe true
    priority :lowest
    def generate(site)
      prefix = File.join(site.source, 'assets/interactive/g1-parkour') + '/'
      site.static_files.map! do |file|
        if file.path.start_with?(prefix) && File.extname(file.path) == '.js'
          StaticFile.new(site, site.source, File.dirname(file.path).delete_prefix(site.source), File.basename(file.path))
        else
          file
        end
      end
    end
  end
end

# Vite emits __vite-browser-external*.js; Jekyll otherwise filters underscore
# filenames. Copy the complete sealed Vite artifact after writing the site.
require 'fileutils'
Jekyll::Hooks.register :site, :post_write do |site|
  relative = 'assets/interactive/g1-parkour'
  destination = File.join(site.dest, relative)
  FileUtils.mkdir_p(destination)
  FileUtils.cp_r(File.join(site.source, relative, '.'), destination)
end
