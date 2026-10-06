# jekyll-terser replaces every .js StaticFile with a minifying writer.
# Restore the solver distribution after that generator, before files are written.
# This preserves upstream bytes and avoids expensive redundant vendor minification.
module Jekyll
  class PreserveLocomotionVendor < Generator
    safe true
    priority :lowest
    def generate(site)
      prefix = File.join(site.source, 'assets/interactive/locomotion-playground/mpc/vendor/casadi') + '/'
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

# Jekyll filters underscore directories inside upstream license bundles.
# Include every original notice, including _deps and _common, in the artifact.
require 'fileutils'
Jekyll::Hooks.register :site, :post_write do |site|
  vendor = 'assets/interactive/locomotion-playground/mpc/vendor/casadi'
  FileUtils.cp_r(File.join(site.source, vendor, 'licenses'), File.join(site.dest, vendor))
end
