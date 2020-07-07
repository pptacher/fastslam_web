#include <stdlib.h>
#include <uv.h>
#include <map>
#define NAPI_EXPERIMENTAL
#include <node_api.h>
#include <string.h>
#include <assert.h>
/////////////////////////////////////////////////////////////////////
//modified boilerplate code from:
//https://github.com/nodejs/node-addon-examples
//https://github.com/gabrielschulhof/abi-stable-node-addon-examples/blob/tsfn_example/thread_safe_function/node-api/example.js
/////////////////////////////////////////////////////////////////////
std::map <uint32_t, char> m;

typedef struct {
  uv_thread_t thread;
  napi_threadsafe_function tsfn;
} ThreadData;

void fastslam(uint, ThreadData*);

// This function is responsible for converting data coming in from the worker
// thread to napi_value items that can be passed into JavaScript, and for
// calling the JavaScript function.
static void call_javascript(napi_env env, napi_value js_cb, void* context, void* data) {
  // This parameter is not used.
  (void) context;

  // env and js_cb may both be NULL if Node.js is in its cleanup phase, and
  // items are left over from earlier thread-safe calls from the worker thread.
  // When env is NULL, we simply skip over the call into Javascript and free the
  // items.
  if (env != NULL) {

    napi_value undefined;
    // Retrieve the JavaScript `undefined` value so we can use it as the `this`
    // value of the JavaScript function call.
    assert(napi_get_undefined(env, &undefined) == napi_ok);

    // Retrieve positions computed by the worker thread.
    void* poses = malloc(2 * 150 * sizeof(float));

    napi_value ab;
    napi_value ta;
    napi_create_arraybuffer(env, 2 * 150 * sizeof(float), (void**)&poses, &ab);
    memcpy(poses, data, 2 * 150 * sizeof(float));
    napi_create_typedarray(env, napi_float32_array, 2 * 150, ab, 0, &ta);

    // Call the JavaScript function and pass it the prime that the secondary
    // thread found.
    assert(napi_call_function(env,
                              undefined,
                              js_cb,
                              1,
                              &ta,
                              NULL) == napi_ok);
  }

  // Free the item created by the worker thread.
  free(data);
}

// This function runs on a worker thread. It has no access to the JavaScript
// environment except through the thread-safe function.
static void execute(void* data) {
  ThreadData* thread_data = (ThreadData*)data;

  // We bracket the use of the thread-safe function by this thread by a call to
  // napi_acquire_threadsafe_function() here, and by a call to
  // napi_release_threadsafe_function() immediately prior to thread exit.
  assert(napi_acquire_threadsafe_function(thread_data->tsfn) == napi_ok);

  fastslam(150, thread_data);

  // Indicate that this thread will make no further use of the thread-safe function.
  assert(napi_release_threadsafe_function(thread_data->tsfn,
                                          napi_tsfn_release) == napi_ok);


}

static napi_value StartThread(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value js_cb, work_name;
  // Allocate data for a new thread.
  ThreadData* thread_data = (ThreadData*) malloc(sizeof(*thread_data));//memory leakage?

// Retrieve the JavaScript callback we should call with items generated by the
  // worker thread, and the per-addon data.
  assert(napi_get_cb_info(env,
                          info,
                          &argc,
                          &js_cb,
                          NULL,
                          NULL) == napi_ok);


    // Create a string to describe this asynchronous operation.
    assert(napi_create_string_utf8(env,
                                   "N-API Thread-safe Call from Async Work Item",
                                   NAPI_AUTO_LENGTH,
                                   &work_name) == napi_ok);

    // Convert the callback retrieved from JavaScript into a thread-safe function
    // which we can call from a worker thread.
    assert(napi_create_threadsafe_function(env,
                                           js_cb,
                                           NULL,
                                           work_name,
                                           0,
                                           1,
                                           NULL,
                                           NULL,
                                           NULL,
                                           call_javascript,
                                           &(thread_data->tsfn)) == napi_ok);

  // Start the new thread.
  assert(uv_thread_create(&(thread_data->thread), execute, thread_data)==0);
  uint32_t tid = (uint32_t)thread_data->thread;
  m[tid] = 1;

  napi_value res;
  assert( napi_create_uint32(env, tid, &res) == napi_ok );

  return res;
}

static napi_value KillThread(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value tid;
  assert(napi_get_cb_info(env, info, &argc, &tid, NULL, NULL) == napi_ok);

  uint32_t tid1;
  assert( napi_get_value_uint32(env, tid, &tid1)== napi_ok );

  m[tid1] = 0;

  return NULL;

}

static napi_value Init(napi_env env, napi_value exports) {

  // Define the properties that will be set on exports.
  napi_property_descriptor props[] = {
    { "startThread", NULL, StartThread, NULL, NULL, NULL, napi_default, NULL },
    { "killThread", NULL, KillThread, NULL, NULL, NULL, napi_default, NULL }
  };

  // Decorate exports with the above-defined properties.
  assert(napi_define_properties(env, exports, 2, props) == napi_ok);

  // Return the decorated exports object.
  return exports;
}

// Mark this as a N-API module.
NAPI_MODULE(NODEGYP_MODULE_NAME, Init)
