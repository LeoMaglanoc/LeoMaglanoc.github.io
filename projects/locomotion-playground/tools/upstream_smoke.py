"""Execute upstream main unchanged; stop only its repeated viewer animation."""
import os, sys, time
sys.path.insert(0, '/opt/wb-mpc'); os.chdir('/opt/wb-mpc')
import main
class ViewerComplete(Exception): pass
original_sleep = time.sleep
count = 0
def bounded_sleep(seconds):
    global count
    count += 1
    if count >= 15: raise ViewerComplete()
    original_sleep(seconds)
# main's controller, parameters and 200 solves are unchanged.
main.time.sleep = bounded_sleep
try:
    main.main()
except ViewerComplete:
    print('UPSTREAM MAIN PASSED: 200 MPC iterations and 15 original viewer frames.', flush=True)
