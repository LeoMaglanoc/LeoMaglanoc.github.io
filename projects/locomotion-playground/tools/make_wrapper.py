"""Generate a small ABI wrapper; math and optimizer remain upstream C."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
d=json.loads((root/'mpc/deployment.json').read_text())
offsets=','.join(str(x['offset']) for x in d['inputs'])
(root/'experiments/wrapper.c').write_text('''#include <stdlib.h>
#include <stdint.h>
typedef int64_t ci;
extern int solver_function(const double**,double**,ci*,double*,int);
extern int solver_function_work(ci*,ci*,ci*,ci*);
extern int decode_solution(const double**,double**,ci*,double*,int);
extern int decode_solution_work(ci*,ci*,ci*,ci*);
static const double** args; static double** results; static ci* iw; static double* work;
static const double** dargs; static double** dresults; static ci* diw; static double* dwork;
static int offsets[] = {'''+offsets+'''};
static void init(void) {
  if(args) return;
  ci a,r,i,w; solver_function_work(&a,&r,&i,&w);
  args=calloc(a,sizeof(double*));results=calloc(r,sizeof(double*));iw=calloc(i,sizeof(ci));work=calloc(w,sizeof(double));
  decode_solution_work(&a,&r,&i,&w);
  dargs=calloc(a,sizeof(double*));dresults=calloc(r,sizeof(double*));diw=calloc(i,sizeof(ci));dwork=calloc(w,sizeof(double));
}
int solve_mpc(const double* input, double* solution, double* decoded) {
  init();for(int i=0;i<15;i++) args[i]=input+offsets[i];results[0]=solution;
  int rc=solver_function(args,results,iw,work,0);if(rc) return rc;
  dargs[0]=solution;for(int i=0;i<14;i++)dargs[i+1]=input+offsets[i];dresults[0]=decoded;
  return decode_solution(dargs,dresults,diw,dwork,0);
}
''')
print('Generated flat ABI wrapper')
