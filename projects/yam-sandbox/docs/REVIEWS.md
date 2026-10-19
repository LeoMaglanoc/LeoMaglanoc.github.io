# Independent checkpoint reviews

An independent review agent inspected native physics, browser runtime and website packaging, ran model/reference checks in Docker, and validated existing project builds.

Native findings: runtime writes only actuator controls; no free-object pose updates/welds. All177 saved joint-reference samples per task were inside actuator ranges and had no arm/table penetration beyond1 mm. The lost-contact height gate could allow a falling object to escape its timeout; fixed to continue monitoring established grasps through transport. Tests now remove contacts after lift and require FAILED; full native suite rerun after the correction. Scene/tool hashes are checked; Docker proxy CA is optional. Explicit force/cylinder changes are documented.

Browser findings: contact and contact-vector wrappers are deleted, reset is synchronous and reuses model/data, fixed stepping and native oracle agree. Found unconditional pagehide deletion during bfcache navigation and a clipped landscape About panel; corrected persisted-page handling/RAF cancellation and bounded scrolling. Local cylinder display scaling affects rendering only, and shared source is unchanged.

Website findings: SLAM production build, unit/asset checks and Party Panic production build/104 unit tests passed without tracked source/lockfile changes. Existing Terser configuration rejected top-level await and omitted main.js; wrapped startup in an async function, then performed a clean Jekyll rebuild and link check. The user subsequently directed direct publication to main; checkpoint commits are preserved there instead of using a PR workflow.
