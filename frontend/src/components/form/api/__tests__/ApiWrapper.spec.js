// Libraries
import Vue from 'vue'
import Vuetify from 'vuetify'
import flushPromises from 'flush-promises'
import { shallowMount } from '@vue/test-utils'
import { ServerException } from '@/plugins/store/index.js'
import veeValidatePlugin from '@/plugins/veeValidate.js'
import ApiWrapper from '../ApiWrapper.vue'
import { VForm, VBtn } from 'vuetify/lib'

jest.mock('lodash')
const { cloneDeep } = jest.requireActual('lodash')

/*
jest.mock('vee-validate', () => ({
  validate: jest.fn().mockResolvedValue({
    valid: true,
    errors: []
  })
})) */

jest.useFakeTimers()

Vue.use(Vuetify)
Vue.use(veeValidatePlugin)
let vuetify

// config factory
function createConfig (overrides) {
  const mocks = {
    api: {
      patch: () => Promise.resolve(),
      get: () => {
        return {
          _meta: {
            load: Promise.resolve()
          }
        }
      }
    }
  }

  const propsData = {
    value: 'Test Value',
    fieldname: 'testField',
    uri: 'testEntity/123',
    label: 'Test Field'
  }

  const stubs = {
    VForm,
    VBtn
  }

  const scopedSlots = {
    default: '<input type="text" name="dummyField" id="dummyField" :value="props.localValue" />'
  }

  return cloneDeep(Object.assign({ mocks, propsData, vuetify, stubs, scopedSlots }, overrides))
}

/**
 * AutoSave = true
 * External value
 */
describe('Testing ApiWrapper [autoSave=true;  manual external value]', () => {
  let wrapper
  let vm
  let config
  let apiPatch
  let validate

  beforeEach(() => {
    vuetify = new Vuetify()

    config = createConfig()
    wrapper = shallowMount(ApiWrapper, config)
    vm = wrapper.vm

    apiPatch = jest.spyOn(config.mocks.api, 'patch')

    const veeValidate = require('vee-validate')
    validate = jest.spyOn(veeValidate, 'validate')
  })

  test('init correctly with default values', () => {
    expect(vm.value).toBe(config.propsData.value)
    expect(vm.dirty).toBe(false)
    expect(vm.isSaving).toBe(false)
    expect(vm.isLoading).toBe(false)
    expect(vm.status).toBe('init')
    expect(vm.autoSave).toBe(true)

    // no buttons expected in AutoSave Mode (which is default)
    expect(wrapper.findAllComponents({ name: 'VBtn' })).toHaveLength(0)
  })

  test('calls api.patch after onInput was triggered', async () => {
    const newValue = 'new value'
    const newValueFromApi = 'NEW VALUE'

    vm.onInput(newValue)

    // value (from outside) is still the same
    expect(vm.value).toBe(config.propsData.value)

    // local Value has changed and is dirty
    expect(vm.dirty).toBe(true)
    expect(vm.localValue).toBe(newValue)

    // resolve lodash debounced
    jest.runAllTimers()

    // saving started
    expect(vm.isSaving).toBe(true)
    expect(vm.dirty).toBe(false)
    expect(vm.status).toBe('saving')

    // API patch method called
    expect(apiPatch).toBeCalledTimes(1)
    expect(apiPatch).toBeCalledWith(config.propsData.uri, { [config.propsData.fieldname]: newValue })

    // wait for patch promise to resolve
    await flushPromises()

    // feedback changed return value from API & make sure it's taken over to localValue
    wrapper.setProps({ value: newValueFromApi })
    await wrapper.vm.$nextTick()
    expect(vm.localValue).toBe(newValueFromApi)

    // success state
    expect(vm.status).toBe('success')

    // wait for timer
    jest.runAllTimers()

    // again in init state
    expect(vm.status).toBe('init')
  })

  test('avoid double triggering of save for enter key', async done => {
    // given
    const input = wrapper.find('input')

    // when
    vm.onInput('new value')
    input.trigger('submit') // trigger submit evenet (simluates enter key)
    jest.runAllTimers() // resolve lodash debounced

    // then
    expect(apiPatch).toHaveBeenCalledTimes(1)

    done()
  })

  test('shows server error if api.patch failed', async () => {
    // given
    apiPatch.mockRejectedValueOnce(new Error('server error'))

    // when
    vm.onInput('new value') // Trigger patch
    jest.runAllTimers() // resolve lodash debounced
    await flushPromises() // wait for patch promise to resolve

    // then
    expect(vm.hasServerError).toBe(true)
    expect(vm.errorMessages).toContain('server error')
  })

  test('can process server validation error', async () => {
    // given
    const validationMsg = 'The input is less than 10 characters long'
    const response = {
      data: { validation_messages: { testField: { stringLengthTooShort: validationMsg } } },
      status: 422
    }
    apiPatch.mockRejectedValueOnce(new ServerException(response))

    // when
    vm.onInput('new value') // Trigger patch
    jest.runAllTimers() // resolve lodash debounced
    await flushPromises() // wait for patch promise to resolve

    // then
    expect(vm.hasServerError).toBe(true)
    expect(vm.errorMessages).toContain('Validation error: ' + validationMsg + '. ')
  })

  test('shows error if `required` validation fails', async done => {
    // given
    wrapper.setProps({ required: true })

    // when
    await vm.onInput('')

    // then
    expect(vm.hasValidationError).toBe(true)
    expect(vm.errorMessages[0]).toMatch('is required')

    done()
  })

  test('shows error if arbitrary validation fails & aborts save', async done => {
    // given
    wrapper.setProps({ validation: 'min:3|myOwnValidationRule' })
    validate.mockResolvedValue({ valid: false, errors: ['Validation failed'] })

    // when
    await vm.onInput('any value')

    // then
    expect(validate).toHaveBeenCalledWith('any value', 'min:3|myOwnValidationRule', { name: 'Test Field' })
    expect(vm.hasValidationError).toBe(true)
    expect(vm.errorMessages[0]).toMatch('Validation failed')

    // when
    vm.save()

    // then
    expect(apiPatch).not.toHaveBeenCalled()

    done()
  })

  test('properly combines `required` and `validation` properties', () => {
    // given
    wrapper.setProps({ required: true, validation: 'min:3|myOwnValidationRule' })

    // when
    vm.onInput('any value')

    // then
    expect(validate).toHaveBeenCalledWith('any value', 'required|min:3|myOwnValidationRule', { name: 'Test Field' })
  })

  test('clears error if arbitrary validation succedes', async done => {
    // given
    wrapper.setProps({ validation: 'required' })
    wrapper.vm.hasValidationError = true
    validate.mockResolvedValue({ valid: true, errors: [] })

    // when
    await vm.onInput('any value')

    // then
    expect(vm.hasValidationError).toBe(false)
    expect(vm.errorMessages).toHaveLength(0)

    done()
  })
})

/**
 * AutoSave = true
 * Value from API
 */
describe('Testing ApiWrapper [autoSave=true; value from API]', () => {
  let wrapper
  let vm
  let config
  // let apiPatch
  let apiGet

  beforeEach(() => {
    vuetify = new Vuetify()

    config = createConfig()
    delete config.propsData.value

    // apiPatch = jest.spyOn(config.mocks.api, 'patch')
    apiGet = jest.spyOn(config.mocks.api, 'get')

    apiGet.mockReturnValue({
      [config.propsData.fieldname]: 'api value',
      _meta: {
        load: Promise.resolve()
      }
    })

    wrapper = shallowMount(ApiWrapper, config)
    vm = wrapper.vm
  })

  test('loads value from API', async () => {
    // given
    apiGet.mockReturnValue({
      [config.propsData.fieldname]: 'api value',
      _meta: {
        load: Promise.resolve()
      }
    })

    // when
    wrapper = shallowMount(ApiWrapper, config)
    vm = wrapper.vm

    // then
    expect(vm.isLoading).toBe(true)

    // when
    await flushPromises() // wait for load promise to resolve

    // then
    expect(vm.hasFinishedLoading).toBe(true)
    expect(vm.isLoading).toBe(false)
    expect(vm.localValue).toBe('api value')
  })

  test('shows error when loading value from API fails', async () => {
    // given
    apiGet.mockReturnValue({
      [config.propsData.fieldname]: 'api value',
      _meta: {
        load: Promise.reject(new Error('loading error'))
      }
    })
    wrapper = shallowMount(ApiWrapper, config)
    vm = wrapper.vm

    // when
    await flushPromises() // wait for load promise to resolve

    // then
    expect(vm.hasFinishedLoading).toBe(false)
    expect(vm.isLoading).toBe(false)
    expect(vm.hasLoadingError).toBe(true)
    expect(vm.errorMessages[0]).toMatch('loading error')
  })
})

/**
 * Manual mode
 */
describe('Testing ApiWrapper [autoSave=false]', () => {
  let wrapper
  let vm
  let config
  let apiPatch

  beforeEach(() => {
    vuetify = new Vuetify()

    config = createConfig()
    config.propsData.autoSave = false

    wrapper = shallowMount(ApiWrapper, config)
    vm = wrapper.vm

    apiPatch = jest.spyOn(config.mocks.api, 'patch')
  })

  test('init correctly with default values', () => {
    expect(vm.value).toBe(config.propsData.value)
    expect(vm.dirty).toBe(false)
    expect(vm.isSaving).toBe(false)
    expect(vm.status).toBe('init')
    expect(vm.autoSave).toBe(false)

    // expecting both a reset button & a save button in manual mode
    expect(wrapper.findAllComponents({ name: 'VBtn' })).toHaveLength(2)
  })

  test('clears dirty flag when local value matches external value', async () => {
    // local change
    vm.onInput('new local value')
    expect(vm.dirty).toBe(true)

    // new value from external --> local value will not be changed
    wrapper.setProps({ value: 'new external value #1' })
    expect(vm.localValue).toBe('new local value')

    // local change to same value as external value
    vm.onInput('new external value #1')
    await vm.$nextTick() // needed for watcher to trigger
    expect(vm.dirty).toBe(false)

    // new value from external --> local value will be changed
    wrapper.setProps({ value: 'new external value #2' })
    await vm.$nextTick() // needed for watcher to trigger
    expect(vm.localValue).toBe('new external value #2')
  })

  test('resets value and errors when `reset` is called', async () => {
    // when
    vm.onInput('new local value')
    vm.hasValidationError = true

    // then
    expect(vm.dirty).toBe(true)
    expect(vm.localValue).toBe('new local value')

    // when
    vm.reset()

    // then
    expect(vm.dirty).toBe(false)
    expect(vm.localValue).toBe('Test Value')
    expect(vm.hasValidationError).toBe(false)
  })

  test('trigger save with enter key', async () => {
    // given
    const input = wrapper.find('input')

    // when
    input.trigger('submit')
    await vm.$nextTick()

    // then
    expect(apiPatch).toHaveBeenCalled()
  })

  test('abort save in readonly mode', () => {
    // given
    wrapper.setProps({ readonly: true })

    // when
    vm.save()

    // then
    expect(apiPatch).not.toHaveBeenCalled()
  })

  test('abort save in disabled mode', () => {
    // given
    wrapper.setProps({ disabled: true })

    // when
    vm.save()

    // then
    expect(apiPatch).not.toHaveBeenCalled()
  })
})
