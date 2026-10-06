#include <stdlib.h>
#include <stdint.h>
typedef int64_t ci;
extern int solver_function(const double**,double**,ci*,double*,int);
extern int solver_function_work(ci*,ci*,ci*,ci*);
extern int decode_solution(const double**,double**,ci*,double*,int);
extern int decode_solution_work(ci*,ci*,ci*,ci*);
static const double** args; static double** results; static ci* iw; static double* work;
static const double** dargs; static double** dresults; static ci* diw; static double* dwork;
static int offsets[] = {0,45,46,47,103,159,160,161,162,164,208,261,267,270,273};
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
